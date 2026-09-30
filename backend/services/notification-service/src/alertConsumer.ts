import { consumeQueue, type MessageMeta } from '@ecopulse/shared/broker';
import { QUEUES, type AlertGeneratedEvent } from '@ecopulse/shared/events';
import { broadcastProximityAlert, getActiveClientCount } from './websocket.js';
import { sendPushNotifications } from './push.js';

// Consumidor da fila `alerts` (evento alert.generated, produzido pelo alert-service).
// Para cada alerta, dissemina por raio geográfico em dois canais complementares:
//   - WebSocket: clientes conectados (app em primeiro plano) - comportamento original;
//   - Push FCM:  dispositivos registrados (app fechado ou em segundo plano) - novo.

async function handleAlert(alert: AlertGeneratedEvent, meta: MessageMeta): Promise<boolean> {
  if (alert == null || alert.reportId == null || alert.lat == null || alert.lng == null) {
    console.error('[Notification] Invalid alert.generated payload. Sending to DLQ.');
    return false;
  }

  console.log(`[Notification] Handling alert ${alert.alertId} for report ${alert.reportId} (${alert.category}, severity ${alert.severity}, radius ${alert.radiusKm}km, msg=${meta.messageId})`);

  const wsCount = broadcastProximityAlert(
    alert.reportId,
    alert.category,
    alert.severity,
    alert.lat,
    alert.lng,
    alert.radiusKm
  );

  // Falha no FCM (ex.: indisponibilidade da API do Google) é transitória: a exceção
  // aciona a política de retries com backoff antes de a mensagem cair na DLQ.
  const pushCount = await sendPushNotifications(alert);

  console.log(`[Notification] Alert ${alert.alertId} dispatched -> websocket=${wsCount}/${getActiveClientCount()} connected, push=${pushCount}`);
  return true;
}

export async function startAlertConsumer(): Promise<void> {
  await consumeQueue<AlertGeneratedEvent>(QUEUES.alerts, handleAlert, { label: '[Notification]' });
}
