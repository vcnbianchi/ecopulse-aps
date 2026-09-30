import 'dart:convert';
import 'dart:math';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/app_config.dart';
import '../../firebase_options.dart';
import '../../presentation/widgets/emergency_alert_dialog.dart';
import 'alert_zone_service.dart';

/// Canal Android usado para as notificações nativas de alerta.
const AndroidNotificationChannel ecopulseAlertsChannel = AndroidNotificationChannel(
  'ecopulse_alerts',
  'Alertas EcoPulse',
  description: 'Alertas preventivos de riscos ambientais próximos a você.',
  importance: Importance.max,
);

final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

/// Handler executado em um isolate separado quando uma push chega com o app em
/// segundo plano ou fechado. Precisa ser função top-level anotada com vm:entry-point.
/// O backend envia mensagens "data-only", então somos nós que exibimos a
/// notificação nativa do sistema.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    // Já inicializado ou sem configuração: segue para exibir a notificação mesmo assim.
  }
  await PushNotificationService.showLocalNotification(message.data);
}

/// Integração com Firebase Cloud Messaging (FCM).
///
/// - obtém o token FCM na inicialização e o registra no backend junto com a
///   localização atual (POST /api/devices/register);
/// - em primeiro plano, exibe o modal de alerta (mesmo do WebSocket);
/// - em segundo plano/fechado, exibe notificação nativa (handler acima);
/// - ao tocar na notificação, abre o app já no mapa centralizado no alerta,
///   com o raio de exclusão destacado.
class PushNotificationService {
  static final PushNotificationService _instance = PushNotificationService._internal();
  factory PushNotificationService() => _instance;
  PushNotificationService._internal();

  static const String _deviceIdKey = 'ecopulse_device_id';

  bool _firebaseReady = false;
  String? _fcmToken;
  String? _deviceId;

  bool get isReady => _firebaseReady;

  /// Deve ser chamado ANTES de runApp: inicializa o Firebase e registra o handler
  /// de background (exigência do firebase_messaging).
  Future<void> initializeFirebase() async {
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      _firebaseReady = true;
      print('[Push] Firebase inicializado.');
    } catch (e) {
      print('[Push] Firebase não configurado (execute `flutterfire configure`). Push desabilitado: $e');
    }
  }

  /// Deve ser chamado APÓS runApp: pede permissão, obtém o token e registra o
  /// dispositivo no backend. Também configura os listeners de mensagens.
  Future<void> initialize() async {
    await _initLocalNotifications();

    if (!_firebaseReady) return;

    try {
      final messaging = FirebaseMessaging.instance;

      await messaging.requestPermission(alert: true, badge: true, sound: true);

      _fcmToken = await messaging.getToken();
      print('[Push] Token FCM obtido: ${_fcmToken?.substring(0, 12)}...');

      messaging.onTokenRefresh.listen((token) {
        _fcmToken = token;
        registerDevice();
      });

      FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen((message) => _handleNotificationTap(message.data));

      final initialMessage = await messaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage.data);
      }

      await registerDevice();
    } catch (e) {
      print('[Push] Falha ao inicializar FCM: $e');
    }
  }

  Future<void> _initLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinSettings = DarwinInitializationSettings();
    const settings = InitializationSettings(android: androidSettings, iOS: darwinSettings);

    await _localNotifications.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: (response) {
        if (response.payload != null) {
          try {
            _handleNotificationTap(jsonDecode(response.payload!) as Map<String, dynamic>);
          } catch (e) {
            print('[Push] Payload inválido na notificação: $e');
          }
        }
      },
    );

    final android = _localNotifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(ecopulseAlertsChannel);
    await android?.requestNotificationsPermission();

    // App aberto a partir do toque em uma notificação local (app estava fechado)
    final launchDetails = await _localNotifications.getNotificationAppLaunchDetails();
    final payload = launchDetails?.notificationResponse?.payload;
    if ((launchDetails?.didNotificationLaunchApp ?? false) && payload != null) {
      try {
        _handleNotificationTap(jsonDecode(payload) as Map<String, dynamic>);
      } catch (_) {}
    }
  }

  /// Exibe a notificação nativa do sistema a partir dos `data` da mensagem FCM.
  static Future<void> showLocalNotification(Map<String, dynamic> data) async {
    if (data['type'] != 'proximity_alert') return;

    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        ecopulseAlertsChannel.id,
        ecopulseAlertsChannel.name,
        channelDescription: ecopulseAlertsChannel.description,
        importance: Importance.max,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        color: Colors.red,
        styleInformation: BigTextStyleInformation(data['message']?.toString() ?? ''),
      ),
    );

    final id = int.tryParse('${data['reportId']}') ?? Random().nextInt(1 << 31);

    await _localNotifications.show(
      id: id,
      title: data['title']?.toString() ?? 'ALERTA PREVENTIVO EcoPulse',
      body: data['message']?.toString() ?? 'Perigo detectado na região.',
      notificationDetails: details,
      payload: jsonEncode(data),
    );
  }

  void _onForegroundMessage(RemoteMessage message) {
    if (message.data['type'] != 'proximity_alert') return;
    print('[Push] Alerta recebido em primeiro plano: ${message.data['message']}');

    final context = navigatorKey.currentContext;
    if (context != null) {
      showEmergencyAlertDialog(context, message.data);
    } else {
      showLocalNotification(message.data);
    }
  }

  /// Toque na notificação: abre o mapa centralizado no alerta com o raio de exclusão.
  void _handleNotificationTap(Map<dynamic, dynamic> data) {
    final zone = AlertZone.fromPayload(data);
    if (zone == null) return;
    print('[Push] Notificação tocada. Centralizando mapa em ${zone.center}.');
    AlertZoneService().showExclusionZone(zone);
  }

  Future<String> _getOrCreateDeviceId() async {
    if (_deviceId != null) return _deviceId!;
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_deviceIdKey);
    if (id == null) {
      final rand = Random.secure();
      id = List.generate(24, (_) => rand.nextInt(16).toRadixString(16)).join();
      await prefs.setString(_deviceIdKey, id);
    }
    _deviceId = id;
    return id;
  }

  Future<Position?> _getCurrentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return null;
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low),
      );
    } catch (_) {
      return null;
    }
  }

  /// Registra (ou atualiza) o dispositivo no backend: token FCM + última localização.
  /// Chamado na inicialização, ao renovar o token e periodicamente junto com o
  /// `location_update` do WebSocket, para manter o raio de alerta atualizado.
  Future<void> registerDevice({double? lat, double? lng}) async {
    if (!_firebaseReady || _fcmToken == null) return;

    try {
      final deviceId = await _getOrCreateDeviceId();

      if (lat == null || lng == null) {
        final position = await _getCurrentPosition();
        lat = position?.latitude;
        lng = position?.longitude;
      }

      final response = await http.post(
        Uri.parse(AppConfig.devicesRegisterEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'deviceId': deviceId,
          'fcmToken': _fcmToken,
          'lat': lat,
          'lng': lng,
          'platform': 'android',
        }),
      );

      if (response.statusCode == 200) {
        print('[Push] Dispositivo registrado no backend (lat=$lat, lng=$lng).');
      } else {
        print('[Push] Falha ao registrar dispositivo. HTTP ${response.statusCode}');
      }
    } catch (e) {
      print('[Push] Erro ao registrar dispositivo: $e');
    }
  }
}
