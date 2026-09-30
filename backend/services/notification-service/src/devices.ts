import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@ecopulse/shared/db';
import { devices } from '@ecopulse/shared/schema';
import redisClient from '@ecopulse/shared/redis';
import { DEVICES_GEO_KEY, isPushEnabled } from './push.js';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { deviceId, fcmToken, lat, lng, platform } = req.body || {};

    if (!deviceId || !fcmToken) {
      return res.status(400).json({ error: 'Invalid payload. deviceId and fcmToken are required.' });
    }

    const latitude = lat != null ? Number(lat) : null;
    const longitude = lng != null ? Number(lng) : null;
    const hasLocation = latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude);

    await db.insert(devices).values({
      deviceId: String(deviceId),
      fcmToken: String(fcmToken),
      platform: platform ? String(platform) : 'android',
      lat: hasLocation ? latitude : null,
      lng: hasLocation ? longitude : null,
    }).onConflictDoUpdate({
      target: devices.deviceId,
      set: {
        fcmToken: String(fcmToken),
        platform: platform ? String(platform) : 'android',
        ...(hasLocation ? { lat: latitude, lng: longitude } : {}),
        updatedAt: sql`now()`,
      },
    });

    if (hasLocation) {
      await redisClient.geoadd(DEVICES_GEO_KEY, longitude as number, latitude as number, String(deviceId));
    }

    console.log(`[Devices] Registered device ${deviceId} (location=${hasLocation ? `${latitude},${longitude}` : 'none'}, push=${isPushEnabled() ? 'enabled' : 'disabled'})`);

    return res.status(200).json({
      message: 'Device registered for push notifications.',
      pushEnabled: isPushEnabled(),
    });
  } catch (error) {
    console.error('[Devices] Error registering device:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
