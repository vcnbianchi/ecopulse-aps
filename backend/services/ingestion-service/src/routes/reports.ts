import { Router, Request, Response } from 'express';
import { publishReport } from '@ecopulse/shared/broker';
import { resolveGeoPartition, PARTITION_COUNT } from '@ecopulse/shared/geo';
import type { ReportIngestedEvent } from '@ecopulse/shared/events';

const router = Router();

const FAULT_INJECTION = process.env.FAULT_INJECTION === 'true';

router.post('/', async (req: Request, res: Response) => {
  try {
    const reportData = req.body;

    if (!reportData || !reportData.category || reportData.latitude == null || reportData.longitude == null) {
      return res.status(400).json({
        error: 'Invalid payload. Category, latitude, and longitude are required.'
      });
    }

    const latitude = Number(reportData.latitude);
    const longitude = Number(reportData.longitude);

    if (Number.isNaN(latitude) || Number.isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }

    const geo = resolveGeoPartition(latitude, longitude);

    const enrichedData: ReportIngestedEvent = {
      category: String(reportData.category),
      severity: Number(reportData.severity) || 1,
      description: reportData.description ? String(reportData.description) : '',
      latitude,
      longitude,
      ingestedAt: new Date().toISOString(),
      geohash: geo.geohash,
      partition: geo.partition,
      simulateFailure: FAULT_INJECTION && reportData.simulateFailure === true,
    };

    const published = await publishReport(enrichedData);

    if (published) {
      console.log(`[API] Report queued -> geohash=${geo.geohash} prefix=${geo.prefix} partition=${geo.partition}/${PARTITION_COUNT}`);
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

export default router;
