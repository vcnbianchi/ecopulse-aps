import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { connectRabbitMQ, closeRabbitMQ, consumeQueue, publishEvent, type MessageMeta } from '@ecopulse/shared/broker';
import { QUEUES, ROUTING_KEYS, type ReportProcessedEvent, type AlertGeneratedEvent } from '@ecopulse/shared/events';


const ALERT_MIN_SEVERITY = parseInt(process.env.ALERT_MIN_SEVERITY || '3');
const ALERT_RADIUS_KM = parseFloat(process.env.ALERT_RADIUS_KM || '5');

function buildAlert(report: ReportProcessedEvent): AlertGeneratedEvent {
  return {
    alertId: randomUUID(),
    reportId: report.id,
    category: report.category,
    severity: report.severity,
    lat: report.lat,
    lng: report.lng,
    radiusKm: ALERT_RADIUS_KM,
    message: `Alerta! Um evento de ${report.category} (Severidade: ${report.severity}) foi reportado próximo a você!`,
    generatedAt: new Date().toISOString(),
  };
}

async function handleReportProcessed(report: ReportProcessedEvent, meta: MessageMeta): Promise<boolean> {
  if (report == null || report.id == null || report.lat == null || report.lng == null) {
    console.error('[Alert] Invalid report.processed payload. Sending to DLQ.');
    return false;
  }

  const severity = report.severity || 1;
  if (severity < ALERT_MIN_SEVERITY) {
    console.log(`[Alert] Report ${report.id} (severity ${severity}) below threshold ${ALERT_MIN_SEVERITY}. No alert.`);
    return true;
  }

  const alert = buildAlert(report);
  const published = await publishEvent(ROUTING_KEYS.alertGenerated, alert);
  if (!published) {
    throw new Error('Failed to publish alert.generated event');
  }

  console.log(`[Alert] alert.generated published for report ${report.id} (severity ${severity}, radius ${ALERT_RADIUS_KM}km, alertId=${alert.alertId}, msg=${meta.messageId})`);
  return true;
}

async function start() {
  try {
    console.log(`[Alert] Starting Alert Service (minSeverity=${ALERT_MIN_SEVERITY}, radius=${ALERT_RADIUS_KM}km)...`);
    await connectRabbitMQ();
    await consumeQueue<ReportProcessedEvent>(QUEUES.reportsProcessed, handleReportProcessed, { label: '[Alert]' });
  } catch (err) {
    console.error('[Alert] Failed to start:', err);
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  console.log(`\n[Alert] Recebido ${signal}. Encerrando serviço...`);
  await closeRabbitMQ();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
