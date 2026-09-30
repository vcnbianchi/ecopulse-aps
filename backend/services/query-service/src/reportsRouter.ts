import { Router, Request, Response } from 'express';
import { db } from '@ecopulse/shared/db';
import { reports } from '@ecopulse/shared/schema';
import redisClient from '@ecopulse/shared/redis';
import { desc } from 'drizzle-orm';

const router = Router();

// GET /api/reports - padrão cache-aside (preservado do monólito original):
//   1. tenta o Redis (lista `recent_reports`, mantida pelo geo-processing-service);
//   2. em cache miss, consulta o PostgreSQL;
//   3. repopula o cache com o resultado.
router.get('/', async (req: Request, res: Response) => {
  try {
    const cachedReports = await redisClient.lrange('recent_reports', 0, -1);

    if (cachedReports && cachedReports.length > 0) {
      const parsedReports = cachedReports.map(item => JSON.parse(item));
      return res.status(200).json({
        source: 'cache',
        count: parsedReports.length,
        data: parsedReports
      });
    }

    const dbReports = await db.select()
      .from(reports)
      .orderBy(desc(reports.createdAt))
      .limit(1000);

    const formattedReports = dbReports.map(r => ({
      id: r.id,
      category: r.category,
      severity: r.severity,
      lat: r.location?.lat,
      lng: r.location?.lng,
      geohash: r.geohash,
      partition: r.partition,
      timestamp: r.createdAt
    }));

    if (formattedReports.length > 0) {
      const pipeline = redisClient.pipeline();
      for (const r of formattedReports) {
        pipeline.rpush('recent_reports', JSON.stringify(r));
      }
      pipeline.ltrim('recent_reports', 0, 999);
      await pipeline.exec();
    }

    return res.status(200).json({
      source: 'database',
      count: formattedReports.length,
      data: formattedReports
    });
  } catch (error) {
    console.error('[API] Error fetching reports:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
