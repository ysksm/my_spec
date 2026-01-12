import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import { connectionsRouter } from './routes/connections';
import { sessionRouter } from './routes/session';
import { browserRouter } from './routes/browser';
import { networkRouter } from './routes/network';
import { websocketHandler } from './routes/websocket';
import { errorHandler } from './middleware/error';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', errorHandler);

// API Routes
app.route('/api/connections', connectionsRouter);
app.route('/api/session', sessionRouter);
app.route('/api/browser', browserRouter);
app.route('/api/network', networkRouter);

// WebSocket endpoint
app.get('/api/events', websocketHandler);

// Static files (frontend)
app.use('/*', serveStatic({ root: '../frontend' }));

// Fallback to index.html for SPA routing
app.get('*', serveStatic({ path: '../frontend/index.html' }));

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`
╔════════════════════════════════════════════════════╗
║     SSH Command Tool 3 - Web GUI                   ║
║     Server running on http://localhost:${port}        ║
╚════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
