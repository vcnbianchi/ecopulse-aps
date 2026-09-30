import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter/material.dart';

class WebSocketService {
  WebSocketChannel? _channel;
  final String _wsUrl = 'ws://10.0.2.2:4500';
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
    showDialog(
      context: context,
      barrierDismissible: false, 
      builder: (context) {
        return AlertDialog(
          backgroundColor: Colors.red[50],
          title: Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 30),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'ALERTA PREVENTIVO',
                  style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                payload['message'] ?? 'Perigo detectado na região.',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              const Text(
                'Sugerimos que altere sua rota imediatamente e evite transitar por esta área.',
                style: TextStyle(fontSize: 14),
              )
            ],
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('ESTOU CIENTE', style: TextStyle(color: Colors.white)),
            ),
          ],
        );
      }
    );
  }

  void dispose() {
    _locationTimer?.cancel();
    _channel?.sink.close();
  }
}
