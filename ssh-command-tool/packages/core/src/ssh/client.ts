import { Client, type ClientChannel, type ConnectConfig } from 'ssh2';
import { EventEmitter } from 'eventemitter3';
import type {
  SSHClientOptions,
  SSHClientEvents,
  ExecResult,
  ExecOptions,
} from '../types';
import { SSHConnectionError, SSHAuthError, SSHTimeoutError, SSHExecError } from '../errors';
import { readPrivateKey, isEncryptedPrivateKey } from '../utils';

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_KEEPALIVE_INTERVAL = 5000;

export class SSHClient extends EventEmitter<SSHClientEvents> {
  private client: Client;
  private connected = false;
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  private options: Required<Pick<SSHClientOptions, 'timeout' | 'keepAliveInterval'>> & SSHClientOptions;

  constructor(options: SSHClientOptions) {
    super();
    this.options = {
      ...options,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      keepAliveInterval: options.keepAliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL,
    };
    this.client = new Client();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      this.connected = true;
      this.startKeepAlive();
      this.emit('ready');
    });

    this.client.on('close', () => {
      this.connected = false;
      this.stopKeepAlive();
      this.emit('close');
    });

    this.client.on('error', (err) => {
      this.connected = false;
      this.stopKeepAlive();
      this.emit('error', err);
    });

    this.client.on('timeout', () => {
      this.emit('timeout');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const config = await this.buildConnectConfig();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.client.end();
        reject(new SSHTimeoutError(`Connection timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.client.off('ready', onReady);
        this.client.off('error', onError);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        if (err.message.includes('authentication') || err.message.includes('auth')) {
          reject(new SSHAuthError(`Authentication failed: ${err.message}`, err));
        } else {
          reject(new SSHConnectionError(`Connection failed: ${err.message}`, err));
        }
      };

      this.client.once('ready', onReady);
      this.client.once('error', onError);

      try {
        this.client.connect(config);
      } catch (err) {
        cleanup();
        reject(new SSHConnectionError(
          `Failed to initiate connection: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err : undefined
        ));
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopKeepAlive();
    if (this.connected) {
      return new Promise((resolve) => {
        this.client.once('close', () => {
          this.connected = false;
          resolve();
        });
        this.client.end();
      });
    }
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    if (!this.connected) {
      throw new SSHConnectionError('Not connected to SSH server');
    }

    const timeout = options?.timeout ?? this.options.timeout;
    const encoding = options?.encoding ?? 'utf-8';

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new SSHTimeoutError(`Command execution timeout after ${timeout}ms`));
      }, timeout);

      this.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(new SSHExecError(`Failed to execute command: ${err.message}`, -1, '', err));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString(encoding);
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString(encoding);
        });

        stream.on('close', (code: number) => {
          clearTimeout(timeoutId);
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? 0,
          });
        });

        stream.on('error', (streamErr: Error) => {
          clearTimeout(timeoutId);
          reject(new SSHExecError(`Stream error: ${streamErr.message}`, -1, stderr, streamErr));
        });
      });
    });
  }

  async shell(): Promise<ClientChannel> {
    if (!this.connected) {
      throw new SSHConnectionError('Not connected to SSH server');
    }

    return new Promise((resolve, reject) => {
      this.client.shell((err, stream) => {
        if (err) {
          reject(new SSHConnectionError(`Failed to open shell: ${err.message}`, err));
          return;
        }
        resolve(stream);
      });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getClient(): Client {
    return this.client;
  }

  private async buildConnectConfig(): Promise<ConnectConfig> {
    const config: ConnectConfig = {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      readyTimeout: this.options.timeout,
      keepaliveInterval: this.options.keepAliveInterval,
      keepaliveCountMax: 3,
    };

    if (this.options.authType === 'password') {
      config.password = this.options.password;
    } else if (this.options.authType === 'privateKey') {
      let privateKey: Buffer | string;

      if (typeof this.options.privateKey === 'string' && !this.options.privateKey.includes('BEGIN')) {
        // It's a file path
        privateKey = await readPrivateKey(this.options.privateKey);
      } else {
        privateKey = this.options.privateKey!;
      }

      config.privateKey = privateKey;

      if (this.options.passphrase) {
        config.passphrase = this.options.passphrase;
      } else if (isEncryptedPrivateKey(privateKey)) {
        throw new SSHAuthError('Private key is encrypted but no passphrase provided');
      }
    }

    return config;
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.connected) {
        // ssh2 handles keepalive internally when keepaliveInterval is set
        // This is just for our internal tracking
      }
    }, this.options.keepAliveInterval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }
}
