import { Redis } from 'ioredis';
import 'dotenv/config';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('[Redis] Connected to Redis cluster/instance');
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err);
});

export default redis;
