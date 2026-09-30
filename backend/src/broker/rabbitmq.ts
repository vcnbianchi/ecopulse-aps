import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const REPORTS_QUEUE = 'reports_ingestion';
const DLQ_QUEUE = 'reports_dead_letter';

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function connectRabbitMQ(retries = 5, delay = 2000) {
  while (retries > 0) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
      
      
      await channel.assertQueue(DLQ_QUEUE, {
        durable: true
      });

      
      await channel.assertQueue(REPORTS_QUEUE, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: DLQ_QUEUE,
      });

      console.log('[RabbitMQ] Connected. Queues asserted (Main + DLQ).');
      return;
    } catch (error) {
      console.error(`[RabbitMQ] Failed to connect. Retries left: ${retries - 1}`);
      retries -= 1;
      if (retries === 0) {
        console.error('[RabbitMQ] Exhausted retries. Could not connect.');
        return;
      }
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

export async function publishReport(reportData: any): Promise<boolean> {
  if (!channel) {
    console.error('[RabbitMQ] Channel not initialized. Cannot publish message.');
    return false;
  }

  try {
    const messageBuffer = Buffer.from(JSON.stringify(reportData));
    
    const success = channel.sendToQueue(REPORTS_QUEUE, messageBuffer, {
      persistent: true,
    });
    
    return success;
  } catch (error) {
    console.error('[RabbitMQ] Error publishing message:', error);
    return false;
  }
}


export async function consumeReports(onMessage: (data: any) => Promise<boolean>) {
  if (!channel) throw new Error('[RabbitMQ] Channel not initialized');

  
  await channel.prefetch(5);

  channel.consume(REPORTS_QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const rawContent = msg.content.toString();
      const payload = JSON.parse(rawContent);

      const success = await onMessage(payload);

      if (success) {
        
        channel!.ack(msg);
      } else {
        
        channel!.nack(msg, false, false);
      }
    } catch (error) {
      console.error('[RabbitMQ] Fatal error processing message. Rejecting to DLQ.', error);
      channel!.nack(msg, false, false);
    }
  }, {
    noAck: false 
  });

  console.log(`[RabbitMQ] Consumer listening on ${REPORTS_QUEUE}`);
}

export async function closeRabbitMQ() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('[RabbitMQ] Connection closed.');
  } catch (error) {
    console.error('[RabbitMQ] Error closing connection:', error);
  }
}
