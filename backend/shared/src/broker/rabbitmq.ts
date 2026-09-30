import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import {
  EVENTS_EXCHANGE,
  RETRY_EXCHANGE,
  QUEUES,
  ROUTING_KEYS,
  partitionQueueName,
  reportIngestedRoutingKey,
  retryQueueName,
  type ReportIngestedEvent,
} from '../events/index.js';
import { PARTITION_COUNT } from '../geo/index.js';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

// Política de retries com backoff exponencial (item 3 da proposta):
// tentativa 1 -> RETRY_BASE_DELAY_MS, tentativa 2 -> 2x, tentativa 3 -> 4x ...
// Após MAX_RETRIES a mensagem é rejeitada e cai na Dead Letter Queue.
export const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
export const RETRY_BASE_DELAY_MS = parseInt(process.env.RETRY_BASE_DELAY_MS || '2000');

const RETRY_COUNT_HEADER = 'x-retry-count';
// O headers exchange do RabbitMQ IGNORA headers iniciados por "x-" na comparação,
// por isso o seletor da fila de retry usa um header sem esse prefixo.
const RETRY_DELAY_HEADER = 'retry-delay-ms';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let shuttingDown = false;

export function retryDelays(): number[] {
  const delays: number[] = [];
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    delays.push(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
  }
  return delays;
}

/**
 * Declara toda a topologia de forma idempotente. Todos os serviços executam isto
 * na inicialização, então não importa a ordem em que os containers sobem.
 *
 *  ecopulse.events (topic)
 *    report.ingested.p{N} -> reports_partition_{N}   (DLQ: reports_dead_letter)
 *    report.processed     -> reports_processed       (DLQ: reports_processed_dead_letter)
 *    alert.generated      -> alerts                  (DLQ: alerts_dead_letter)
 *
 *  ecopulse.retry (headers)  retry-delay-ms=2000 -> reports_retry_2000ms (TTL 2s)  --DLX--> ecopulse.events
 *                            retry-delay-ms=4000 -> reports_retry_4000ms (TTL 4s)  --DLX--> ecopulse.events
 *                            retry-delay-ms=8000 -> reports_retry_8000ms (TTL 8s)  --DLX--> ecopulse.events
 *
 * A mensagem expirada na fila de retry volta ao topic exchange com a MESMA routing key
 * original, ou seja, retorna exatamente para a fila/partição de onde saiu.
 */
async function assertTopology(ch: Channel): Promise<void> {
  await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  await ch.assertExchange(RETRY_EXCHANGE, 'headers', { durable: true });

  // Dead Letter Queues (comportamento original preservado: nack(msg, false, false) -> DLQ)
  await ch.assertQueue(QUEUES.reportsDeadLetter, { durable: true });
  await ch.assertQueue(QUEUES.reportsProcessedDeadLetter, { durable: true });
  await ch.assertQueue(QUEUES.alertsDeadLetter, { durable: true });

  // Filas particionadas por quadrante geográfico (sharding horizontal)
  for (let i = 0; i < PARTITION_COUNT; i++) {
    const queue = partitionQueueName(i);
    await ch.assertQueue(queue, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: QUEUES.reportsDeadLetter,
    });
    await ch.bindQueue(queue, EVENTS_EXCHANGE, reportIngestedRoutingKey(i));
  }

  await ch.assertQueue(QUEUES.reportsProcessed, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: QUEUES.reportsProcessedDeadLetter,
  });
  await ch.bindQueue(QUEUES.reportsProcessed, EVENTS_EXCHANGE, ROUTING_KEYS.reportProcessed);

  await ch.assertQueue(QUEUES.alerts, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: QUEUES.alertsDeadLetter,
  });
  await ch.bindQueue(QUEUES.alerts, EVENTS_EXCHANGE, ROUTING_KEYS.alertGenerated);

  // Filas de retry com TTL crescente (padrão "retry queue + dead-lettering de volta")
  for (const delay of retryDelays()) {
    const queue = retryQueueName(delay);
    await ch.assertQueue(queue, {
      durable: true,
      messageTtl: delay,
      deadLetterExchange: EVENTS_EXCHANGE,
    });
    await ch.bindQueue(queue, RETRY_EXCHANGE, '', {
      'x-match': 'all',
      [RETRY_DELAY_HEADER]: String(delay),
    });
  }
}

// O RabbitMQ pode levar >30s para aceitar conexões AMQP no primeiro boot, por isso
// a janela de tentativas é generosa (30 x 3s = 90s) antes de desistir.
export async function connectRabbitMQ(retries = 30, delay = 3000): Promise<void> {
  while (retries > 0) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      await assertTopology(channel);

      connection.on('error', (err: Error) => {
        console.error('[RabbitMQ] Connection error:', err.message);
      });
      connection.on('close', () => {
        if (shuttingDown) return;
        // Deixa o orquestrador (Docker) reiniciar o processo em estado limpo.
        console.error('[RabbitMQ] Connection closed unexpectedly. Exiting for restart.');
        process.exit(1);
      });

      console.log(
        `[RabbitMQ] Connected. Topology asserted (exchange=${EVENTS_EXCHANGE}, partitions=${PARTITION_COUNT}, retries=${MAX_RETRIES}, backoff=${retryDelays().join('/')}ms + DLQ).`
      );
      return;
    } catch (error) {
      console.error(`[RabbitMQ] Failed to connect. Retries left: ${retries - 1}`);
      retries -= 1;
      if (retries === 0) {
        console.error('[RabbitMQ] Exhausted retries. Could not connect.');
        throw error;
      }
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

export function getChannel(): Channel | null {
  return channel;
}

/** Publica um evento no topic exchange `ecopulse.events`. */
export async function publishEvent(routingKey: string, payload: unknown, headers: Record<string, unknown> = {}): Promise<boolean> {
  if (!channel) {
    console.error('[RabbitMQ] Channel not initialized. Cannot publish message.');
    return false;
  }

  try {
    const messageBuffer = Buffer.from(JSON.stringify(payload));
    return channel.publish(EVENTS_EXCHANGE, routingKey, messageBuffer, {
      persistent: true,
      contentType: 'application/json',
      messageId: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      headers,
    });
  } catch (error) {
    console.error('[RabbitMQ] Error publishing message:', error);
    return false;
  }
}

/**
 * Publica um relato ingerido na partição geográfica correta.
 * Routing key: report.ingested.p{partition} -> fila reports_partition_{partition}
 */
export async function publishReport(reportData: ReportIngestedEvent): Promise<boolean> {
  return publishEvent(reportIngestedRoutingKey(reportData.partition), reportData);
}

export interface MessageMeta {
  messageId: string;
  routingKey: string;
  queue: string;
  retryCount: number;
}

/**
 * Contrato do handler:
 *   - retorna true  -> ack (processado com sucesso)
 *   - retorna false -> nack sem requeue -> DLQ imediatamente (mensagem inválida / "poison message")
 *   - lança exceção -> falha transitória: reenfileira com backoff exponencial; após MAX_RETRIES vai para a DLQ
 */
export type MessageHandler<T> = (payload: T, meta: MessageMeta) => Promise<boolean>;

export interface ConsumeOptions {
  prefetch?: number;
  label?: string;
}

function stripDeathHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  // Os headers x-death/x-first-death-*/x-last-death-* são gerados pelo broker a cada
  // dead-lettering; removê-los antes de republicar evita reencodar estruturas internas.
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key === 'x-death' || key.startsWith('x-first-death') || key.startsWith('x-last-death')) continue;
    clean[key] = value;
  }
  return clean;
}

function scheduleRetry(msg: ConsumeMessage, queue: string, retryCount: number, label: string): void {
  const attempt = retryCount + 1;
  const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  const messageId = msg.properties.messageId || '(no-id)';

  console.warn(`${label} Retry ${attempt}/${MAX_RETRIES} for message ${messageId}, waiting ${delay}ms (queue=${queue})`);

  const headers = {
    ...stripDeathHeaders(msg.properties.headers || {}),
    [RETRY_COUNT_HEADER]: attempt,
    [RETRY_DELAY_HEADER]: String(delay),
    'x-original-queue': queue,
  };

  channel!.publish(RETRY_EXCHANGE, msg.fields.routingKey, msg.content, {
    persistent: true,
    contentType: msg.properties.contentType || 'application/json',
    messageId: msg.properties.messageId,
    timestamp: msg.properties.timestamp,
    headers,
  });
  channel!.ack(msg);
}

/** Consome uma fila com política de retries + DLQ. */
export async function consumeQueue<T>(queue: string, onMessage: MessageHandler<T>, options: ConsumeOptions = {}): Promise<void> {
  if (!channel) throw new Error('[RabbitMQ] Channel not initialized');

  const label = options.label || '[RabbitMQ]';
  await channel.prefetch(options.prefetch ?? 5);

  await channel.consume(queue, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    const messageId = msg.properties.messageId || '(no-id)';
    const retryCount = Number(msg.properties.headers?.[RETRY_COUNT_HEADER] ?? 0);

    let payload: T;
    try {
      payload = JSON.parse(msg.content.toString()) as T;
    } catch (error) {
      console.error(`${label} Malformed JSON in message ${messageId}. Rejecting to DLQ.`, error);
      channel!.nack(msg, false, false);
      return;
    }

    try {
      const success = await onMessage(payload, {
        messageId,
        routingKey: msg.fields.routingKey,
        queue,
        retryCount,
      });

      if (success) {
        channel!.ack(msg);
      } else {
        console.error(`${label} Message ${messageId} rejected by handler (non-retryable). Sending to DLQ.`);
        channel!.nack(msg, false, false);
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.error(`${label} Transient failure processing message ${messageId}:`, (error as Error).message);
        scheduleRetry(msg, queue, retryCount, label);
      } else {
        console.error(`${label} Message ${messageId} exhausted ${MAX_RETRIES} retries. Rejecting to DLQ.`, error);
        channel!.nack(msg, false, false);
      }
    }
  }, {
    noAck: false,
  });

  console.log(`${label} Consumer listening on ${queue}`);
}

/** Consome uma partição geográfica específica (reports_partition_{N}). */
export async function consumePartition(partition: number, onMessage: MessageHandler<ReportIngestedEvent>, options: ConsumeOptions = {}): Promise<void> {
  return consumeQueue<ReportIngestedEvent>(partitionQueueName(partition), onMessage, options);
}

export async function closeRabbitMQ(): Promise<void> {
  shuttingDown = true;
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('[RabbitMQ] Connection closed.');
  } catch (error) {
    console.error('[RabbitMQ] Error closing connection:', error);
  }
}
