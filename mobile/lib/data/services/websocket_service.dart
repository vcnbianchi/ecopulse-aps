import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter/material.dart';
import '../../core/app_config.dart';
import '../../presentation/widgets/emergency_alert_dialog.dart';
import 'push_notification_service.dart';

class WebSocketService {
  WebSocketChannel? _channel;
  final String _wsUrl = AppConfig.wsUrl;
  Timer? _locationTimer;


  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();


  void initialize(BuildContext context) {
    _connect(context);


    _locationTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _sendLocationUpdate();
    });
  }

  void _connect(BuildContext context) {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl));


      _sendLocationUpdate();

      _channel!.stream.listen(
        (message) {
          _handleMessage(context, message);
        },
        onDone: () {
          print('[WS] Conexão fechada. Tentando reconectar...');
          Future.delayed(const Duration(seconds: 5), () {
            if (context.mounted) _connect(context);
          });
        },
        onError: (error) {
          print('[WS] Erro: $error');
        }
      );
    } catch (e) {
      print('[WS] Falha ao iniciar WebSocket: $e');
    }
  }

  Future<void> _sendLocationUpdate() async {
    if (_channel == null) return;

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return;

      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low)
      );

      final payload = jsonEncode({
        'type': 'location_update',
        'lat': position.latitude,
        'lng': position.longitude,
      });

      _channel!.sink.add(payload);

      PushNotificationService().registerDevice(lat: position.latitude, lng: position.longitude);
    } catch (e) {
      print('[WS] Erro ao enviar update de localização: $e');
    }
  }

  void _handleMessage(BuildContext context, dynamic message) {
    try {
      final data = jsonDecode(message);
      if (data['type'] == 'proximity_alert') {
        final payload = data['payload'];
        _showEmergencyModal(context, payload);
      }
    } catch (e) {
      print('[WS] Erro ao decodificar mensagem: $e');
    }
  }

  void _showEmergencyModal(BuildContext context, dynamic payload) {
    final dialogContext = navigatorKey.currentContext ?? context;
    showEmergencyAlertDialog(dialogContext, payload as Map<dynamic, dynamic>);
  }

  void dispose() {
    _locationTimer?.cancel();
    _channel?.sink.close();
  }
}
