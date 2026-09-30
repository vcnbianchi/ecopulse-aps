import fs from 'node:fs';
import admin from 'firebase-admin';
import { eq, inArray, isNotNull, and } from 'drizzle-orm';
import { db } from '@ecopulse/shared/db';
import { devices } from '@ecopulse/shared/schema';
import redisClient from '@ecopulse/shared/redis';
import { getDistanceFromLatLonInKm } from '@ecopulse/shared/geo';
import type { AlertGeneratedEvent } from '@ecopulse/shared/events';

// Push notifications via Firebase Cloud Messaging (FCM).
// Cobre o caso não atendido pelo WebSocket: app fechado ou em segundo plano.
// Credenciais: arquivo JSON da service account do Firebase, apontado por
// FIREBASE_SERVICE_ACCOUNT_PATH (ou GOOGLE_APPLICATION_CREDENTIALS). Sem o arquivo o
// serviço sobe normalmente e apenas desabilita o canal push (WebSocket continua ativo).

export const DEVICES_GEO_KEY = 'devices_geo';

let pushEnabled = false;

export function initPushNotifications(): void {
  const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    console.warn(`[Push] Firebase service account not found (FIREBASE_SERVICE_ACCOUNT_PATH=${credentialsPath || 'unset'}). Push notifications DISABLED; WebSocket alerts remain active.`);
    return;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    pushEnabled = true;
    console.log(`[Push] Firebase Admin initialized (project=${serviceAccount.project_id}). Push notifications ENABLED.`);
  } catch (error) {
    console.error('[Push] Failed to initialize Firebase Admin. Push notifications DISABLED.', error);
  }
}

export function isPushEnabled(): boolean {
  return pushEnabled;
}

/**
 * Localiza dispositivos registrados dentro do raio do alerta.
 * Caminho rápido: índice geoespacial do Redis (GEOSEARCH em `devices_geo`).
 * Fallback: varredura no PostgreSQL com Haversine (caso o índice Redis esteja vazio).
 */
export async function findDevicesWithinRadius(lat: number, lng: number, radiusKm: number): Promise<{ deviceId: string; fcmToken: string }[]> {
  let deviceIds: string[] = [];

  try {
    const indexed = await redisClient.zcard(DEVICES_GEO_KEY);
    if (indexed > 0) {
      deviceIds = await redisClient.geosearch(DEVICES_GEO_KEY, 'FROMLONLAT', lng, lat, 'BYRADIUS', radiusKm, 'km') as string[];
      if (deviceIds.length === 0) return [];

      const rows = await db.select({ deviceId: devices.deviceId, fcmToken: devices.fcmToken })
        .from(devices)
        .where(inArray(devices.deviceId, deviceIds));
      return rows;
    }
  } catch (error) {
    console.error('[Push] Redis GEOSEARCH failed, falling back to PostgreSQL scan:', error);
  }

  const rows = await db.select({ deviceId: devices.deviceId, fcmToken: devices.fcmToken, lat: devices.lat, lng: devices.lng })
    .from(devices)
    .where(and(isNotNull(devices.lat), isNotNull(devices.lng)))
    .limit(5000);

  return rows
    .filter((d) => getDistanceFromLatLonInKm(lat, lng, d.lat as number, d.lng as number) <= radiusKm)
    .map((d) => ({ deviceId: d.deviceId, fcmToken: d.fcmToken }));
}

/** Envia o alerta por push para todos os dispositivos dentro do raio. Retorna o total entregue. */
export async function sendPushNotifications(alert: AlertGeneratedEvent): Promise<number> {
  const targets = await findDevicesWithinRadius(alert.lat, alert.lng, alert.radiusKm);

  if (targets.length === 0) {
    console.log(`[Push] No registered devices within ${alert.radiusKm}km of report ${alert.reportId}.`);
    return 0;
  }

  if (!pushEnabled) {
    console.warn(`[Push] ${targets.length} device(s) within radius but push is disabled (missing Firebase credentials).`);
    return 0;
  }

  const tokens = Array.from(new Set(targets.map((t) => t.fcmToken)));

  // Mensagem "data-only" com prioridade alta: o app Flutter trata em
  // FirebaseMessaging.onBackgroundMessage e exibe a notificação nativa do sistema.
  // Todos os valores de `data` devem ser strings (restrição do FCM).
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      type: 'proximity_alert',
      alertId: alert.alertId,
      reportId: String(alert.reportId),
      category: alert.category,
      severity: String(alert.severity),
      lat: String(alert.lat),
      lng: String(alert.lng),
      radiusKm: String(alert.radiusKm),
      title: 'ALERTA PREVENTIVO EcoPulse',
      message: alert.message,
      generatedAt: alert.generatedAt,
    },
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
    },
  });

  // Higieniza tokens inválidos/expirados para não insistir em dispositivos desinstalados
  const invalidTokens: string[] = [];
  response.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        invalidTokens.push(tokens[idx]);
      } else {
        console.error(`[Push] Failed to deliver to token #${idx}: ${code}`);
      }
    }
  });

  if (invalidTokens.length > 0) {
    const stale = targets.filter((t) => invalidTokens.includes(t.fcmToken));
    for (const device of stale) {
      await db.delete(devices).where(eq(devices.deviceId, device.deviceId));
      await redisClient.zrem(DEVICES_GEO_KEY, device.deviceId);
    }
    console.warn(`[Push] Removed ${stale.length} device(s) with invalid FCM tokens.`);
  }

  console.log(`[Push] Alert ${alert.alertId} delivered to ${response.successCount}/${tokens.length} device(s) within ${alert.radiusKm}km.`);
  return response.successCount;
}
