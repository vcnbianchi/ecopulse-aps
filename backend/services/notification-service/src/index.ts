import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectRabbitMQ, closeRabbitMQ } from '@ecopulse/shared/broker';
import { pgClient } from '@ecopulse/shared/db';
import redisClient from '@ecopulse/shared/redis';
import { initWebSocketServer } from './websocket.js';
import { initPushNotifications } from './push.js';
import devicesRouter from './devices.js';
import { startAlertConsumer } from './alertConsumer.js';

// notification-service
// Consome a fila `alerts` (evento alert.generated) e dissemina o alerta por dois canais:
//   1. WebSocket -> clientes conectados dentro do raio (app aberto);
//   2. Push FCM  -> dispositivos registrados dentro do raio (app fechado/segundo plano).
// Também expõe POST /api/devices/register para o app cadastrar seu token FCM + localização.

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'notification-service' });
});

app.use('/api/devices', devicesRouter);

let server: ReturnType<typeof app.listen> | undefined;

async function start() {
  try {
    initPushNotifications();

    await connectRabbitMQ();

    server = app.listen(PORT, () => {
      console.log(`[Notification] Servidor rodando na porta ${PORT}`);
    });

    initWebSocketServer(server);

    await startAlertConsumer();
  } catch (err) {
    console.error('[Notification] Failed to start server:', err);
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  console.log(`\n[Notification] Recebido ${signal}. Encerrando servidor...`);

  try {
    await closeRabbitMQ();
    await pgClient.end();
    console.log('[Notification] PostgreSQL connection closed.');
    await redisClient.quit();
    console.log('[Notification] Redis connection closed.');
  } catch (err) {
    console.error('[Notification] Error during disconnect:', err);
  }

  if (server) {
    server.close(() => {
      console.log('[Notification] Servidor HTTP encerrado.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
