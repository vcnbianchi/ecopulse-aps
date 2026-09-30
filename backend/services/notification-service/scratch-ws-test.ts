import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:4500');

ws.on('open', () => {
  console.log('Connected to EcoPulse WS');
  
  ws.send(JSON.stringify({
    type: 'location_update',
    lat: -23.5500,
    lng: -46.6330,
  }));
  console.log('Sent location update');
});

ws.on('message', (data) => {
  console.log('Received ALERT from server:', data.toString());
});

ws.on('error', console.error);
