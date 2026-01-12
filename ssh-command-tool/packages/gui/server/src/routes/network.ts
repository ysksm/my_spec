import { Hono } from 'hono';
import { getSession } from './session';

const router = new Hono();

// POST /api/network/start - Start recording
router.post('/start', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    await session.network.start();
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/network/stop - Stop recording
router.post('/stop', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    await session.network.stop();
    return c.json({
      success: true,
      count: session.network.getEntries().length,
    });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// GET /api/network/entries - Get recorded entries
router.get('/entries', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  const limit = parseInt(c.req.query('limit') || '100', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const type = c.req.query('type');
  const status = c.req.query('status');

  let entries = session.network.getEntries();

  // Apply filters
  if (type) {
    entries = entries.filter((e) =>
      e.request.resourceType.toLowerCase().includes(type.toLowerCase())
    );
  }

  if (status) {
    const statusCode = parseInt(status, 10);
    entries = entries.filter((e) => e.response?.status === statusCode);
  }

  const total = entries.length;
  entries = entries.slice(offset, offset + limit);

  return c.json({
    entries,
    total,
    limit,
    offset,
  });
});

// GET /api/network/export - Export as HAR
router.get('/export', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  const format = c.req.query('format') || 'har';

  if (format === 'har') {
    const har = session.network.exportHAR();
    c.header('Content-Type', 'application/json');
    c.header('Content-Disposition', 'attachment; filename="network.har"');
    return c.json(har);
  } else {
    const json = session.network.exportJSON();
    c.header('Content-Type', 'application/json');
    c.header('Content-Disposition', 'attachment; filename="network.json"');
    return c.body(json);
  }
});

// DELETE /api/network/clear - Clear recorded entries
router.delete('/clear', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  session.network.clear();
  return c.json({ success: true });
});

// GET /api/network/status - Get recording status
router.get('/status', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  return c.json({
    recording: session.network.isRecording(),
    count: session.network.getEntries().length,
  });
});

export { router as networkRouter };
