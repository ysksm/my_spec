import { Hono } from 'hono';
import { ConfigManager, SSHClient } from '@ssh-tool/core';

const router = new Hono();
const configManager = new ConfigManager();

// Initialize config manager
let configLoaded = false;
async function ensureConfigLoaded() {
  if (!configLoaded) {
    await configManager.load();
    configLoaded = true;
  }
}

// GET /api/connections - List all connections
router.get('/', async (c) => {
  await ensureConfigLoaded();
  const connections = configManager.getAllConnections();

  // Remove sensitive data
  const safeConnections = connections.map((conn) => ({
    ...conn,
    password: conn.password ? '********' : undefined,
  }));

  return c.json({ connections: safeConnections });
});

// GET /api/connections/:id - Get connection details
router.get('/:id', async (c) => {
  await ensureConfigLoaded();
  const id = c.req.param('id');
  const connection = configManager.getConnection(id);

  if (!connection) {
    return c.json({ error: { message: 'Connection not found' } }, 404);
  }

  return c.json({
    connection: {
      ...connection,
      password: connection.password ? '********' : undefined,
    },
  });
});

// POST /api/connections - Create new connection
router.post('/', async (c) => {
  await ensureConfigLoaded();
  const body = await c.req.json();

  try {
    const id = await configManager.addConnection({
      name: body.name,
      host: body.host,
      port: body.port || 22,
      username: body.username,
      authType: body.authType,
      password: body.password,
      privateKeyPath: body.privateKeyPath,
    });

    return c.json({ id }, 201);
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      400
    );
  }
});

// PUT /api/connections/:id - Update connection
router.put('/:id', async (c) => {
  await ensureConfigLoaded();
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    await configManager.updateConnection(id, body);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      400
    );
  }
});

// DELETE /api/connections/:id - Delete connection
router.delete('/:id', async (c) => {
  await ensureConfigLoaded();
  const id = c.req.param('id');

  const removed = await configManager.removeConnection(id);
  if (!removed) {
    return c.json({ error: { message: 'Connection not found' } }, 404);
  }

  return c.json({ success: true });
});

// POST /api/connections/:id/test - Test connection
router.post('/:id/test', async (c) => {
  await ensureConfigLoaded();
  const id = c.req.param('id');
  const connection = configManager.getConnection(id);

  if (!connection) {
    return c.json({ error: { message: 'Connection not found' } }, 404);
  }

  const sshClient = new SSHClient({
    host: connection.host,
    port: connection.port,
    username: connection.username,
    authType: connection.authType,
    password: connection.password,
    privateKey: connection.privateKeyPath,
  });

  try {
    await sshClient.connect();
    const result = await sshClient.exec('echo "Connection successful"');
    await sshClient.disconnect();

    return c.json({
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Connection successful' : result.stderr,
    });
  } catch (error) {
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export { router as connectionsRouter };
