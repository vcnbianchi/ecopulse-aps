// Contratos de eventos trocados entre os microsserviços via RabbitMQ.
// Todo o roteamento acontece em um único topic exchange (`ecopulse.events`),
// usando routing keys hierárquicas:
//
//   report.ingested.p{N}  -> publicado pelo ingestion-service (N = partição geográfica)
//   report.processed      -> publicado pelo geo-processing-service
//   alert.generated       -> publicado pelo alert-service
//
// Os serviços NUNCA se chamam por HTTP: apenas produzem/consomem estes eventos.

export const EVENTS_EXCHANGE = 'ecopulse.events';
export const RETRY_EXCHANGE = 'ecopulse.retry';

export const ROUTING_KEYS = {
  reportIngestedPrefix: 'report.ingested',
  reportProcessed: 'report.processed',
  alertGenerated: 'alert.generated',
} as const;

export const QUEUES = {
  // Prefixo das filas particionadas: reports_partition_0 ... reports_partition_{N-1}
  reportsPartitionPrefix: 'reports_partition_',
  reportsDeadLetter: 'reports_dead_letter',
  reportsProcessed: 'reports_processed',
  reportsProcessedDeadLetter: 'reports_processed_dead_letter',
  alerts: 'alerts',
  alertsDeadLetter: 'alerts_dead_letter',
  // Prefixo das filas de retry com TTL: reports_retry_2000ms, reports_retry_4000ms, ...
  retryPrefix: 'reports_retry_',
} as const;

export function reportIngestedRoutingKey(partition: number): string {
  return `${ROUTING_KEYS.reportIngestedPrefix}.p${partition}`;
}

export function partitionQueueName(partition: number): string {
  return `${QUEUES.reportsPartitionPrefix}${partition}`;
}

export function retryQueueName(delayMs: number): string {
  return `${QUEUES.retryPrefix}${delayMs}ms`;
}

// --- Payloads -------------------------------------------------------------

/** Evento `report.ingested.p{N}`: relato bruto validado pela API, ainda não persistido. */
export interface ReportIngestedEvent {
  category: string;
  severity: number;
  description?: string;
  latitude: number;
  longitude: number;
  ingestedAt: string;
  geohash: string;
  partition: number;
  /** Flag de injeção de falhas para demonstrar retries/DLQ em sala (ver FAULT_INJECTION). */
  simulateFailure?: boolean;
}

/** Evento `report.processed`: relato persistido no PostgreSQL e indexado no Redis. */
export interface ReportProcessedEvent {
  id: number;
  category: string;
  severity: number;
  description: string;
  lat: number;
  lng: number;
  geohash: string;
  partition: number;
  timestamp: string;
  processedBy: string;
}

/** Evento `alert.generated`: regra de negócio decidiu que o relato merece alerta de proximidade. */
export interface AlertGeneratedEvent {
  alertId: string;
  reportId: number;
  category: string;
  severity: number;
  lat: number;
  lng: number;
  radiusKm: number;
  message: string;
  generatedAt: string;
}
