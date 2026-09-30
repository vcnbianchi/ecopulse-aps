import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pgClient } from '@ecopulse/shared/db';
import redisClient from '@ecopulse/shared/redis';
import reportsRouter from './reportsRouter.js';


const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'query-service' });
});

app.use('/api/reports', reportsRouter);

const server = app.listen(PORT, () => {
  console.log(`[Query] Servidor rodando na porta ${PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`\n[Query] Recebido ${signal}. Encerrando servidor...`);
  try {
    await pgClient.end();
    console.log('[Query] PostgreSQL connection closed.');
    await redisClient.quit();
    console.log('[Query] Redis connection closed.');
  } catch (err) {
    console.error('[Query] Error during disconnect:', err);
  }

  server.close(() => {
    console.log('[Query] Servidor HTTP encerrado.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
