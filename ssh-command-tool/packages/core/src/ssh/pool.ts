import { EventEmitter } from 'eventemitter3';
import { SSHClient } from './client';
import type {
  SSHClientOptions,
  ConnectionPoolEvents,
  ConnectionState,
  ExecResult,
  PoolOptions,
} from '../types';
import { SSHConnectionError } from '../errors';
import { generateId, sleep } from '../utils';

interface PooledConnection {
  id: string;
  name: string;
  client: SSHClient;
  options: SSHClientOptions;
  state: ConnectionState;
  lastActivity: number;
  reconnectAttempts: number;
}

const DEFAULT_POOL_OPTIONS: Required<PoolOptions> = {
  maxConnections: 10,
  idleTimeout: 300000, // 5 minutes
  autoReconnect: true,
  reconnectAttempts: 3,
  reconnectDelay: 5000,
};

export class ConnectionPool extends EventEmitter<ConnectionPoolEvents> {
  private connections = new Map<string, PooledConnection>();
  private options: Required<PoolOptions>;
  private idleCheckTimer?: ReturnType<typeof setInterval>;

  constructor(options?: PoolOptions) {
    super();
    this.options = { ...DEFAULT_POOL_OPTIONS, ...options };
    this.startIdleCheck();
  }

  async add(name: string, clientOptions: SSHClientOptions): Promise<SSHClient> {
    if (this.connections.size >= this.options.maxConnections) {
      throw new SSHConnectionError(`Maximum connections (${this.options.maxConnections}) reached`);
    }

    const id = generateId();
    const client = new SSHClient(clientOptions);

    const connection: PooledConnection = {
      id,
      name,
      client,
      options: clientOptions,
      state: 'idle',
      lastActivity: Date.now(),
      reconnectAttempts: 0,
    };

    this.connections.set(id, connection);
    this.setupClientEvents(id, client);
    this.emit('connection:added', id);

    return client;
  }

  async addAndConnect(name: string, clientOptions: SSHClientOptions): Promise<{ id: string; client: SSHClient }> {
    const client = await this.add(name, clientOptions);
    const id = this.findIdByClient(client);
    if (!id) {
      throw new SSHConnectionError('Failed to find connection after adding');
    }

    await this.connect(id);
    return { id, client };
  }

  get(id: string): SSHClient | undefined {
    const connection = this.connections.get(id);
    if (connection) {
      connection.lastActivity = Date.now();
      return connection.client;
    }
    return undefined;
  }

  getByName(name: string): SSHClient | undefined {
    for (const connection of this.connections.values()) {
      if (connection.name === name) {
        connection.lastActivity = Date.now();
        return connection.client;
      }
    }
    return undefined;
  }

  async connect(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new SSHConnectionError(`Connection not found: ${id}`);
    }

    this.updateState(id, 'connecting');

    try {
      await connection.client.connect();
      connection.reconnectAttempts = 0;
      this.updateState(id, 'connected');
      this.emit('connection:ready', id);
    } catch (error) {
      this.updateState(id, 'error');
      this.emit('connection:error', id, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    const connection = this.connections.get(id);
    if (!connection) {
      return false;
    }

    try {
      await connection.client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    this.connections.delete(id);
    this.emit('connection:removed', id);
    return true;
  }

  getAll(): Array<{
    id: string;
    name: string;
    state: ConnectionState;
    lastActivity: number;
  }> {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.id,
      name: conn.name,
      state: conn.state,
      lastActivity: conn.lastActivity,
    }));
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.values()).map(async (conn) => {
      try {
        await conn.client.disconnect();
      } catch {
        // Ignore individual disconnect errors
      }
    });

    await Promise.all(disconnectPromises);
  }

  async exec(id: string, command: string): Promise<ExecResult> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new SSHConnectionError(`Connection not found: ${id}`);
    }

    if (!connection.client.isConnected()) {
      throw new SSHConnectionError(`Connection ${id} is not connected`);
    }

    connection.lastActivity = Date.now();
    return connection.client.exec(command);
  }

  async execAll(command: string): Promise<Map<string, ExecResult | Error>> {
    const results = new Map<string, ExecResult | Error>();

    const execPromises = Array.from(this.connections.entries())
      .filter(([, conn]) => conn.client.isConnected())
      .map(async ([id, conn]) => {
        try {
          const result = await conn.client.exec(command);
          results.set(id, result);
        } catch (error) {
          results.set(id, error instanceof Error ? error : new Error(String(error)));
        }
      });

    await Promise.all(execPromises);
    return results;
  }

  size(): number {
    return this.connections.size;
  }

  getConnectedCount(): number {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.state === 'connected'
    ).length;
  }

  async close(): Promise<void> {
    this.stopIdleCheck();
    await this.disconnectAll();
    this.connections.clear();
  }

  private findIdByClient(client: SSHClient): string | undefined {
    for (const [id, conn] of this.connections.entries()) {
      if (conn.client === client) {
        return id;
      }
    }
    return undefined;
  }

  private setupClientEvents(id: string, client: SSHClient): void {
    client.on('close', () => {
      const connection = this.connections.get(id);
      if (connection && this.options.autoReconnect) {
        this.handleDisconnect(id);
      }
    });

    client.on('error', (error) => {
      this.updateState(id, 'error');
      this.emit('connection:error', id, error);
    });
  }

  private async handleDisconnect(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) return;

    if (connection.reconnectAttempts >= this.options.reconnectAttempts) {
      this.updateState(id, 'error');
      return;
    }

    this.updateState(id, 'reconnecting');
    connection.reconnectAttempts++;

    await sleep(this.options.reconnectDelay * connection.reconnectAttempts);

    try {
      // Create a new client for reconnection
      const newClient = new SSHClient(connection.options);
      await newClient.connect();

      connection.client = newClient;
      connection.reconnectAttempts = 0;
      this.setupClientEvents(id, newClient);
      this.updateState(id, 'connected');
      this.emit('connection:ready', id);
    } catch (error) {
      if (connection.reconnectAttempts < this.options.reconnectAttempts) {
        this.handleDisconnect(id);
      } else {
        this.updateState(id, 'error');
        this.emit('connection:error', id, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private updateState(id: string, state: ConnectionState): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.state = state;
      this.emit('connection:state', id, state);
    }
  }

  private startIdleCheck(): void {
    this.idleCheckTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, conn] of this.connections.entries()) {
        if (
          conn.state === 'connected' &&
          now - conn.lastActivity > this.options.idleTimeout
        ) {
          conn.client.disconnect().catch(() => {});
          this.updateState(id, 'idle');
        }
      }
    }, 60000); // Check every minute
  }

  private stopIdleCheck(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = undefined;
    }
  }
}
