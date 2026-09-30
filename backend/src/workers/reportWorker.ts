import { consumeReports } from '../broker/rabbitmq.js';
import { db } from '../db/index.js';
import { reports } from '../db/schema.js';
import redisClient from '../db/redis.js';
import { broadcastProximityAlert } from '../services/websocket.js';

export async function startReportWorker() {
  console.log('[Worker] Starting Report Processing Worker...');

  await consumeReports(async (data: any) => {
    try {
      console.log(`[Worker] Processing incoming report: ${data.category}`);

      
      if (!data.category || data.latitude == null || data.longitude == null) {
        console.error('[Worker] Validation failed: missing critical fields. Sending to DLQ.');
        return false; 
      }

      
      const [insertedReport] = await db.insert(reports).values({
        category: data.category,
        severity: data.severity || 1,
        description: data.description || '',
        location: {
          lat: data.latitude,
          lng: data.longitude,
        },
        status: 'active',
      }).returning({ id: reports.id });

      console.log(`[Worker] Report inserted into PostgreSQL with ID: ${insertedReport.id}`);

      
      
      
      const cacheData = JSON.stringify({
        id: insertedReport.id,
        category: data.category,
        severity: data.severity || 1,
        lat: data.latitude,
        lng: data.longitude,
        timestamp: data.ingestedAt,
      });

      await redisClient.lpush('recent_reports', cacheData);
      
      
      await redisClient.ltrim('recent_reports', 0, 999);

      
      await redisClient.geoadd(
        'reports_geo',
        data.longitude,
        data.latitude,
        insertedReport.id.toString()
      );

      
      const severityLevel = data.severity || 1;
      if (severityLevel >= 3) {
        broadcastProximityAlert(
          insertedReport.id,
          data.category,
          severityLevel,
          data.latitude,
          data.longitude,
          5.0 
        );
      }

      console.log(`[Worker] Successfully processed and cached report ID: ${insertedReport.id}`);

      return true; 
    } catch (error) {
      console.error('[Worker] Exception during processing. Sending to DLQ.', error);
      return false; 
    }
  });
}
