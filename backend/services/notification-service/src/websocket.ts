import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { getDistanceFromLatLonInKm } from '@ecopulse/shared/geo';

// Servidor WebSocket (migrado do monólito sem alteração de comportamento observável):
// mantém em memória a última localização de cada cliente e, ao receber um alerta,
// entrega `proximity_alert` apenas para quem está dentro do raio (Haversine).

interface ClientData {
  ws: WebSocket;
  lat: number;
  lng: number;
}

const activeClients = new Map<string, ClientData>();

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    const clientId = Math.random().toString(36).substring(7);
    console.log(`[WebSocket] Client connected: ${clientId}`);

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'location_update' && data.lat != null && data.lng != null) {
          activeClients.set(clientId, {
            ws,
            lat: data.lat,
            lng: data.lng,
          });
        }
      } catch (err) {
        console.error(`[WebSocket] Invalid message from ${clientId}:`, err);
      }
    });

    ws.on('close', () => {
      activeClients.delete(clientId);
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
    });
  });

  console.log('[WebSocket] Server initialized and listening for connections');
}

export function getActiveClientCount(): number {
  return activeClients.size;
}

export function broadcastProximityAlert(
  reportId: number,
  category: string,
  severity: number,
  reportLat: number,
  reportLng: number,
  radiusKm: number = 5.0
): number {
  let alertedCount = 0;

  activeClients.forEach((client, clientId) => {
    const distance = getDistanceFromLatLonInKm(reportLat, reportLng, client.lat, client.lng);

    if (distance <= radiusKm) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'proximity_alert',
          payload: {
            id: reportId,
            category,
            severity,
            lat: reportLat,
            lng: reportLng,
            radiusKm,
            distanceKm: distance.toFixed(2),
            message: `Alerta! Um evento de ${category} (Severidade: ${severity}) foi reportado a ${distance.toFixed(1)}km de você!`,
          }
        }));
        alertedCount++;
      }
    }
  });

  if (alertedCount > 0) {
    console.log(`[WebSocket] Alert broadcasted to ${alertedCount} nearby clients (Radius: ${radiusKm}km).`);
  }

  return alertedCount;
}
