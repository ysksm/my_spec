import { Hono } from 'hono';
import {
  ConfigManager,
  SessionManager,
  type SessionOptions,
} from '@ssh-tool/core';
import { broadcastEvent } from './websocket';

const router = new Hono();
const configManager = new ConfigManager();

// Global session instance
let currentSession: SessionManager | null = null;

// Initialize config
let configLoaded = false;
async function ensureConfigLoaded() {
  if (!configLoaded) {
    await configManager.load();
    configLoaded = true;
  }
}

export function getSession(): SessionManager | null {
  return currentSession;
}

// POST /api/session/start - Start session
router.post('/start', async (c) => {
  await ensureConfigLoaded();
  const body = await c.req.json();

  if (currentSession?.isReady()) {
    return c.json({ error: { message: 'Session already active' } }, 400);
  }

  const connectionId = body.connectionId;
  const connection = configManager.getConnection(connectionId);

  if (!connection) {
    return c.json({ error: { message: 'Connection not found' } }, 404);
  }

  const sessionOptions: SessionOptions = {
    connection: {
      host: connection.host,
      port: connection.port,
      username: connection.username,
      authType: connection.authType,
      password: connection.password,
      privateKey: connection.privateKeyPath,
    },
    browser: {
      headless: body.headless ?? true,
      debuggingPort: body.remotePort ?? 9222,
    },
    portForward: {
      localPort: body.localPort ?? 9222,
      remotePort: body.remotePort ?? 9222,
    },
  };

  try {
    currentSession = new SessionManager(sessionOptions);

    // Set up state change broadcasting
    currentSession.on('state:change', (state) => {
      broadcastEvent({
        type: 'session:state',
        payload: state,
        timestamp: Date.now(),
      });
    });

    currentSession.on('error', (error) => {
      broadcastEvent({
        type: 'error',
        payload: { message: error.message },
        timestamp: Date.now(),
      });
    });

    await currentSession.start();

    // Save as last used connection
    await configManager.setLastConnectionId(connection.id);

    return c.json({
      success: true,
      state: currentSession.getState(),
    });
  } catch (error) {
    if (currentSession) {
      await currentSession.stop().catch(() => {});
      currentSession = null;
    }
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/session/stop - Stop session
router.post('/stop', async (c) => {
  if (!currentSession) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    await currentSession.stop();
    currentSession = null;
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// GET /api/session/status - Get session status
router.get('/status', async (c) => {
  if (!currentSession) {
    return c.json({
      active: false,
      state: null,
    });
  }

  return c.json({
    active: currentSession.isReady(),
    state: currentSession.getState(),
  });
});

export { router as sessionRouter };
