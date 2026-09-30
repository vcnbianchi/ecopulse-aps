export const EVENTS_EXCHANGE = 'ecopulse.events';
export const RETRY_EXCHANGE = 'ecopulse.retry';

export const ROUTING_KEYS = {
  reportIngestedPrefix: 'report.ingested',
  reportProcessed: 'report.processed',
  alertGenerated: 'alert.generated',
} as const;

export const QUEUES = {
  reportsPartitionPrefix: 'reports_partition_',
  reportsDeadLetter: 'reports_dead_letter',
  reportsProcessed: 'reports_processed',
  reportsProcessedDeadLetter: 'reports_processed_dead_letter',
  alerts: 'alerts',
  alertsDeadLetter: 'alerts_dead_letter',
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


export interface ReportIngestedEvent {
  category: string;
  severity: number;
  description?: string;
  latitude: number;
  longitude: number;
  ingestedAt: string;
  geohash: string;
  partition: number;
  simulateFailure?: boolean;
}

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
