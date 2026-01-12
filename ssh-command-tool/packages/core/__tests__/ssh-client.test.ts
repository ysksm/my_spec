import { describe, expect, test, mock } from 'bun:test';
import { SSHClient } from '../src/ssh/client';
import { SSHConnectionError, SSHTimeoutError } from '../src/errors';

describe('SSHClient', () => {
  test('should create an instance with default options', () => {
    const client = new SSHClient({
      host: 'localhost',
      port: 22,
      username: 'test',
      authType: 'password',
      password: 'test',
    });

    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  test('should throw error when executing command while disconnected', async () => {
    const client = new SSHClient({
      host: 'localhost',
      port: 22,
      username: 'test',
      authType: 'password',
      password: 'test',
    });

    await expect(client.exec('ls')).rejects.toThrow(SSHConnectionError);
  });

  test('should throw error when opening shell while disconnected', async () => {
    const client = new SSHClient({
      host: 'localhost',
      port: 22,
      username: 'test',
      authType: 'password',
      password: 'test',
    });

    await expect(client.shell()).rejects.toThrow(SSHConnectionError);
  });

  test('should not attempt to disconnect when not connected', async () => {
    const client = new SSHClient({
      host: 'localhost',
      port: 22,
      username: 'test',
      authType: 'password',
      password: 'test',
    });

    // Should not throw
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });
});

describe('SSHClient events', () => {
  test('should emit events on state changes', () => {
    const client = new SSHClient({
      host: 'localhost',
      port: 22,
      username: 'test',
      authType: 'password',
      password: 'test',
    });

    const readyHandler = mock(() => {});
    const closeHandler = mock(() => {});
    const errorHandler = mock(() => {});

    client.on('ready', readyHandler);
    client.on('close', closeHandler);
    client.on('error', errorHandler);

    // Verify handlers are registered
    expect(client.listenerCount('ready')).toBe(1);
    expect(client.listenerCount('close')).toBe(1);
    expect(client.listenerCount('error')).toBe(1);
  });
});
