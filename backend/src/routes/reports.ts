import { Router, Request, Response } from 'express';
import { publishReport } from '../broker/rabbitmq.js';
import { db } from '../db/index.js';
import { reports } from '../db/schema.js';
import redisClient from '../db/redis.js';
import { desc } from 'drizzle-orm';

const router = Router();


router.post('/', async (req: Request, res: Response) => {
  try {
    const reportData = req.body;

    
    if (!reportData || !reportData.category || reportData.latitude == null || reportData.longitude == null) {
      return res.status(400).json({ 
        error: 'Invalid payload. Category, latitude, and longitude are required.' 
      });
    }

    
    const enrichedData = {
      ...reportData,
      ingestedAt: new Date().toISOString(),
    };

    
    const published = await publishReport(enrichedData);

    if (published) {
      return res.status(202).json({
        message: 'Report received and queued for processing.',
        data: enrichedData
      });
    } else {
      return res.status(500).json({
        error: 'Failed to queue the report. Internal broker error.'
      });
    }
  } catch (error) {
    console.error('[API] Error processing report ingestion:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});




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
