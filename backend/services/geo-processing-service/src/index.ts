import 'dotenv/config';
import os from 'node:os';
import { connectRabbitMQ, closeRabbitMQ } from '@ecopulse/shared/broker';
import { pgClient } from '@ecopulse/shared/db';
import redisClient from '@ecopulse/shared/redis';
import { PARTITION_COUNT } from '@ecopulse/shared/geo';
import { startReportWorker } from './reportWorker.js';


export const INSTANCE_ID = process.env.INSTANCE_ID || os.hostname();

function resolvePartitions(): number[] {
  const raw = (process.env.PARTITIONS || 'all').trim().toLowerCase();
  if (raw === 'all' || raw === '*' || raw === '') {
    return Array.from({ length: PARTITION_COUNT }, (_, i) => i);
  }
  const partitions = raw
    .split(',')
    .map((p) => parseInt(p.trim()))
    .filter((p) => !Number.isNaN(p) && p >= 0 && p < PARTITION_COUNT);

  if (partitions.length === 0) {
    throw new Error(`[GeoProcessing] PARTITIONS="${raw}" is invalid. Expected "all" or indexes between 0 and ${PARTITION_COUNT - 1}.`);
  }
  return partitions;
}

async function start() {
  try {
    const partitions = resolvePartitions();
    console.log(`[GeoProcessing] Instance ${INSTANCE_ID} starting. Assigned partitions: [${partitions.join(', ')}] of ${PARTITION_COUNT}`);

    await connectRabbitMQ();
    await startReportWorker(partitions, INSTANCE_ID);
  } catch (err) {
    console.error('[GeoProcessing] Failed to start:', err);
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  console.log(`\n[GeoProcessing] Recebido ${signal}. Encerrando worker...`);
  try {
    await closeRabbitMQ();
    await pgClient.end();
    console.log('[GeoProcessing] PostgreSQL connection closed.');
    await redisClient.quit();
    console.log('[GeoProcessing] Redis connection closed.');
  } catch (err) {
    console.error('[GeoProcessing] Error during disconnect:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
