import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectRabbitMQ, closeRabbitMQ } from '@ecopulse/shared/broker';
import reportsRouter from './routes/reports.js';


const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'ingestion-service' });
});

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'EcoPulse Ingestion Service - Monitoramento Colaborativo de Riscos Ambientais',
    version: '2.0.0',
  });
});

app.use('/api/reports', reportsRouter);

let server: ReturnType<typeof app.listen> | undefined;

async function start() {
  try {
    await connectRabbitMQ();

    server = app.listen(PORT, () => {
      console.log(`[Ingestion] Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('[Ingestion] Failed to start server:', err);
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  console.log(`\n[Ingestion] Recebido ${signal}. Encerrando servidor...`);
  await closeRabbitMQ();

  if (server) {
    server.close(() => {
      console.log('[Ingestion] Servidor HTTP encerrado.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
