import { Hono } from 'hono';
import { getSession } from './session';

const router = new Hono();

// POST /api/browser/navigate - Navigate to URL
router.post('/navigate', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  const body = await c.req.json();
  let url = body.url;

  if (!url) {
    return c.json({ error: { message: 'URL is required' } }, 400);
  }

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    await session.page.navigate(url, {
      waitUntil: body.waitUntil || 'load',
      timeout: body.timeout || 30000,
    });

    const [currentUrl, title] = await Promise.all([
      session.page.getUrl(),
      session.page.getTitle(),
    ]);

    return c.json({
      success: true,
      url: currentUrl,
      title,
    });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/browser/screenshot - Take screenshot
router.post('/screenshot', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  const body = await c.req.json();

  try {
    const buffer = await session.screenshot.take({
      format: body.format || 'png',
      quality: body.quality || 80,
      fullPage: body.fullPage || false,
    });

    // Return as base64
    return c.json({
      success: true,
      data: buffer.toString('base64'),
      format: body.format || 'png',
    });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// GET /api/browser/info - Get page info
router.get('/info', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    const [url, title] = await Promise.all([
      session.page.getUrl(),
      session.page.getTitle(),
    ]);

    return c.json({ url, title });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/browser/back - Go back
router.post('/back', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    await session.page.goBack();
    const url = await session.page.getUrl();
    return c.json({ success: true, url });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/browser/forward - Go forward
router.post('/forward', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    await session.page.goForward();
    const url = await session.page.getUrl();
    return c.json({ success: true, url });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/browser/reload - Reload page
router.post('/reload', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  try {
    await session.page.reload();
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

// POST /api/browser/evaluate - Evaluate JavaScript
router.post('/evaluate', async (c) => {
  const session = getSession();
  if (!session?.isReady()) {
    return c.json({ error: { message: 'No active session' } }, 400);
  }

  const body = await c.req.json();
  if (!body.expression) {
    return c.json({ error: { message: 'Expression is required' } }, 400);
  }

  try {
    const result = await session.page.evaluate(body.expression);
    return c.json({ success: true, result });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      500
    );
  }
});

export { router as browserRouter };
