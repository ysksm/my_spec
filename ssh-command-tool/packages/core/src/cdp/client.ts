import { EventEmitter } from 'eventemitter3';
import type { CDPClientOptions, CDPClientEvents, CDPTarget } from '../types';
import { CDPConnectionError, CDPTimeoutError, CDPProtocolError } from '../errors';

const DEFAULT_OPTIONS: Required<CDPClientOptions> = {
  host: 'localhost',
  port: 9222,
  connectionTimeout: 5000,
};

interface PendingMessage {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}

export class CDPClient extends EventEmitter<CDPClientEvents> {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingMessages = new Map<number, PendingMessage>();
  private options: Required<CDPClientOptions>;
  private connected = false;

  constructor(options: Partial<CDPClientOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  static async getTargets(host: string, port: number): Promise<CDPTarget[]> {
    const url = `http://${host}:${port}/json/list`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      throw new CDPConnectionError(
        `Failed to get targets: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  static async getVersion(host: string, port: number): Promise<{ browser: string; webSocketDebuggerUrl?: string }> {
    const url = `http://${host}:${port}/json/version`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      throw new CDPConnectionError(
        `Failed to get version: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async connect(targetId?: string): Promise<void> {
    if (this.connected) {
      return;
    }

    let wsUrl: string;

    if (targetId) {
      const targets = await CDPClient.getTargets(this.options.host, this.options.port);
      const target = targets.find((t) => t.id === targetId);
      if (!target?.webSocketDebuggerUrl) {
        throw new CDPConnectionError(`Target not found or has no WebSocket URL: ${targetId}`);
      }
      wsUrl = target.webSocketDebuggerUrl;
    } else {
      // Connect to the browser endpoint
      const version = await CDPClient.getVersion(this.options.host, this.options.port);
      if (version.webSocketDebuggerUrl) {
        wsUrl = version.webSocketDebuggerUrl;
      } else {
        // Fallback: try to get the first page target
        const targets = await CDPClient.getTargets(this.options.host, this.options.port);
        const pageTarget = targets.find((t) => t.type === 'page');
        if (!pageTarget?.webSocketDebuggerUrl) {
          throw new CDPConnectionError('No suitable target found');
        }
        wsUrl = pageTarget.webSocketDebuggerUrl;
      }
    }

    // Replace host if connecting through localhost tunnel
    if (this.options.host !== 'localhost' && wsUrl.includes('localhost')) {
      wsUrl = wsUrl.replace('localhost', this.options.host);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
        }
        reject(new CDPTimeoutError(`Connection timeout after ${this.options.connectionTimeout}ms`));
      }, this.options.connectionTimeout);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          this.connected = true;
          this.emit('connected');
          resolve();
        };

        this.ws.onerror = (event) => {
          clearTimeout(timeoutId);
          const error = new CDPConnectionError('WebSocket error');
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.rejectAllPending();
          this.emit('disconnected');
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        clearTimeout(timeoutId);
        reject(
          new CDPConnectionError(
            `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.ws || !this.connected) {
      return;
    }

    return new Promise((resolve) => {
      this.ws!.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.rejectAllPending();
        resolve();
      };
      this.ws!.close();
    });
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new CDPConnectionError('Not connected to CDP');
    }

    const id = ++this.messageId;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        method,
      });

      try {
        this.ws!.send(message);
      } catch (error) {
        this.pendingMessages.delete(id);
        reject(
          new CDPConnectionError(
            `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.id !== undefined) {
        // Response to a request
        const pending = this.pendingMessages.get(message.id);
        if (pending) {
          this.pendingMessages.delete(message.id);
          if (message.error) {
            pending.reject(
              new CDPProtocolError(
                `${pending.method} failed: ${message.error.message}`,
                message.error.code
              )
            );
          } else {
            pending.resolve(message.result);
          }
        }
      } else if (message.method) {
        // Event from CDP
        this.emit('message', message.method, message.params);
      }
    } catch (error) {
      this.emit('error', new CDPProtocolError(`Failed to parse message: ${error}`));
    }
  }

  private rejectAllPending(): void {
    for (const [id, pending] of this.pendingMessages.entries()) {
      pending.reject(new CDPConnectionError('Connection closed'));
      this.pendingMessages.delete(id);
    }
  }
}
