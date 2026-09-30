import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { db, pgClient } from './db/index.js';
import redisClient from './db/redis.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connectRabbitMQ, closeRabbitMQ } from './broker/rabbitmq.js';
import { startReportWorker } from './workers/reportWorker.js';
import { initWebSocketServer } from './services/websocket.js';
import reportsRouter from './routes/reports.js';

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'ecopulse-backend' });
});


app.get('/', (req, res) => {
  res.status(200).json({
    message: 'EcoPulse Backend - Monitoramento Colaborativo de Riscos Ambientais',
    version: '1.0.0',
  });
});


app.use('/api/reports', reportsRouter);

async function runMigrations() {
  console.log('[DB] Running migrations...');
  await pgClient`CREATE EXTENSION IF NOT EXISTS postgis;`;
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('[DB] Migrations completed successfully.');
}

let server: any;

async function start() {
  try {
    
    await runMigrations();

    
    await connectRabbitMQ();

    
    await startReportWorker();


    
    const server = app.listen(PORT, () => {
      console.log(`[EcoPulse] Servidor rodando na porta ${PORT}`);
    });

    
    initWebSocketServer(server);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}


const shutdown = async (signal: string) => {
  console.log(`\n[EcoPulse] Recebido ${signal}. Encerrando servidor...`);
  
  try {
    await closeRabbitMQ();
    
    await pgClient.end();
    console.log('[EcoPulse] PostgreSQL connection closed.');
    
    await redisClient.quit();
    console.log('[EcoPulse] Redis connection closed.');
  } catch (err) {
    console.error('[EcoPulse] Error during disconnect:', err);
  }

  if (server) {
    server.close(() => {
      console.log('[EcoPulse] Servidor HTTP encerrado.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
