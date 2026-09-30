import { consumePartition, publishEvent, type MessageMeta } from '@ecopulse/shared/broker';
import { db } from '@ecopulse/shared/db';
import { reports } from '@ecopulse/shared/schema';
import redisClient from '@ecopulse/shared/redis';
import { computeGeohash, partitionForGeohash } from '@ecopulse/shared/geo';
import { ROUTING_KEYS, type ReportIngestedEvent, type ReportProcessedEvent } from '@ecopulse/shared/events';


export async function startReportWorker(partitions: number[], instanceId: string) {
  console.log('[Worker] Starting Geo Processing Worker...');

  for (const partition of partitions) {
    await consumePartition(partition, async (data: ReportIngestedEvent, meta: MessageMeta) => {
      const label = `[Worker:p${partition}]`;
      console.log(`${label} Processing incoming report: ${data.category} (msg=${meta.messageId}, attempt=${meta.retryCount + 1})`);

      if (!data.category || data.latitude == null || data.longitude == null) {
        console.error(`${label} Validation failed: missing critical fields. Sending to DLQ.`);
        return false;
      }

      if (data.simulateFailure) {
        throw new Error('Simulated transient failure (simulateFailure=true)');
      }

      const geohash = data.geohash || computeGeohash(data.latitude, data.longitude);
      const resolvedPartition = data.partition ?? partitionForGeohash(geohash);

      if (resolvedPartition !== partition) {
        console.warn(`${label} Report geohash=${geohash} belongs to partition ${resolvedPartition} but arrived at ${partition}.`);
      }

      const [insertedReport] = await db.insert(reports).values({
        category: data.category,
        severity: data.severity || 1,
        description: data.description || '',
        location: {
          lat: data.latitude,
          lng: data.longitude,
        },
        geohash,
        partition: resolvedPartition,
        status: 'active',
      }).returning({ id: reports.id });

      console.log(`${label} Report inserted into PostgreSQL with ID: ${insertedReport.id} (geohash=${geohash})`);

      const cacheData = JSON.stringify({
        id: insertedReport.id,
        category: data.category,
        severity: data.severity || 1,
        lat: data.latitude,
        lng: data.longitude,
        geohash,
        partition: resolvedPartition,
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

      const processedEvent: ReportProcessedEvent = {
        id: insertedReport.id,
        category: data.category,
        severity: data.severity || 1,
        description: data.description || '',
        lat: data.latitude,
        lng: data.longitude,
        geohash,
        partition: resolvedPartition,
        timestamp: data.ingestedAt,
        processedBy: instanceId,
      };

      const published = await publishEvent(ROUTING_KEYS.reportProcessed, processedEvent);
      if (!published) {
        throw new Error('Failed to publish report.processed event');
      }

      console.log(`${label} Successfully processed and cached report ID: ${insertedReport.id}. Event report.processed published.`);

      return true;
    }, { label: `[Worker:p${partition}]` });
  }
}
