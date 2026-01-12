import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { ConfigManager } from '../src/config/manager';
import { ValidationError } from '../src/errors';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigManager', () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ssh-tool-test-'));
    configManager = new ConfigManager({ configDir: tempDir });
    await configManager.load();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('should load with default config', async () => {
    const config = configManager.getConfig();
    expect(config.version).toBe('1.0.0');
    expect(config.connections).toHaveLength(0);
  });

  test('should add a connection', async () => {
    const id = await configManager.addConnection({
      name: 'Test Server',
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      authType: 'privateKey',
      privateKeyPath: '~/.ssh/id_rsa',
    });

    expect(id).toBeDefined();

    const connection = configManager.getConnection(id);
    expect(connection).toBeDefined();
    expect(connection?.name).toBe('Test Server');
    expect(connection?.host).toBe('test.example.com');
  });

  test('should update a connection', async () => {
    const id = await configManager.addConnection({
      name: 'Test Server',
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      authType: 'privateKey',
      privateKeyPath: '~/.ssh/id_rsa',
    });

    await configManager.updateConnection(id, { port: 2222 });

    const connection = configManager.getConnection(id);
    expect(connection?.port).toBe(2222);
  });

  test('should remove a connection', async () => {
    const id = await configManager.addConnection({
      name: 'Test Server',
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      authType: 'privateKey',
      privateKeyPath: '~/.ssh/id_rsa',
    });

    const removed = await configManager.removeConnection(id);
    expect(removed).toBe(true);

    const connection = configManager.getConnection(id);
    expect(connection).toBeUndefined();
  });

  test('should get connection by name', async () => {
    await configManager.addConnection({
      name: 'Unique Name',
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      authType: 'privateKey',
      privateKeyPath: '~/.ssh/id_rsa',
    });

    const connection = configManager.getConnectionByName('Unique Name');
    expect(connection).toBeDefined();
    expect(connection?.name).toBe('Unique Name');
  });

  test('should validate connection on add', async () => {
    await expect(
      configManager.addConnection({
        name: '',
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        authType: 'privateKey',
        privateKeyPath: '~/.ssh/id_rsa',
      })
    ).rejects.toThrow(ValidationError);
  });

  test('should update browser settings', async () => {
    await configManager.updateBrowserSettings({ defaultHeadless: false });

    const settings = configManager.getBrowserSettings();
    expect(settings.defaultHeadless).toBe(false);
  });

  test('should update port forward defaults', async () => {
    await configManager.updatePortForwardDefaults({ localPort: 9999 });

    const defaults = configManager.getPortForwardDefaults();
    expect(defaults.localPort).toBe(9999);
  });
});
