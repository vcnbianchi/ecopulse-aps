import 'package:flutter/material.dart';
import '../../data/services/alert_zone_service.dart';

/// Modal de alerta preventivo, compartilhado pelos dois canais de alerta
/// (WebSocket em primeiro plano e push FCM recebido com o app aberto).
///
/// O botão "Ver rota alternativa" ativa o roteamento preventivo simplificado:
/// o mapa é centralizado no ponto de risco e um raio de exclusão é destacado.
void showEmergencyAlertDialog(BuildContext context, Map<dynamic, dynamic> payload) {
  final zone = AlertZone.fromPayload(payload);

  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) {
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
              payload['message']?.toString() ?? 'Perigo detectado na região.',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            const Text(
              'Sugerimos que altere sua rota imediatamente e evite transitar por esta área.',
              style: TextStyle(fontSize: 14),
            ),
          ],
        ),
        actionsAlignment: MainAxisAlignment.spaceBetween,
        actions: [
          if (zone != null)
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red[800]),
              icon: const Icon(Icons.alt_route),
              label: const Text('VER ROTA ALTERNATIVA'),
              onPressed: () {
                Navigator.of(dialogContext).pop();
                AlertZoneService().showExclusionZone(zone);
              },
            ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('ESTOU CIENTE', style: TextStyle(color: Colors.white)),
          ),
        ],
      );
    },
  );
}
