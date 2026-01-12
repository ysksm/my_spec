import type { Context } from 'hono';
import type { WSMessage } from '@ssh-tool/core';

// Store connected WebSocket clients
const clients = new Set<WebSocket>();

export function broadcastEvent(message: WSMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function websocketHandler(c: Context) {
  // Check if request is a WebSocket upgrade
  const upgradeHeader = c.req.header('upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  // Bun's WebSocket handling
  const server = (globalThis as any).Bun?.serve;
  if (!server) {
    return c.text('WebSocket not supported', 500);
  }

  // Return upgrade response for Bun
  return new Response(null, {
    status: 101,
    webSocket: {
      open(ws: WebSocket) {
        clients.add(ws);
        console.log('WebSocket client connected');

        // Send initial state
        ws.send(JSON.stringify({
          type: 'connected',
          payload: { message: 'Connected to SSH Command Tool 3' },
          timestamp: Date.now(),
        }));
      },
      message(ws: WebSocket, message: string) {
        // Handle incoming messages (for future use)
        try {
          const data = JSON.parse(message as string);
          console.log('WebSocket message:', data);
        } catch {
          // Ignore invalid messages
        }
      },
      close(ws: WebSocket) {
        clients.delete(ws);
        console.log('WebSocket client disconnected');
      },
    },
  } as any);
}

export function getConnectedClients(): number {
  return clients.size;
}
