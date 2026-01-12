export type AuthType = 'password' | 'privateKey';
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface SSHClientOptions {
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  timeout?: number;
  keepAliveInterval?: number;
}

export interface ExecOptions {
  timeout?: number;
  encoding?: BufferEncoding;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  state: ConnectionState;
  lastActivity: number;
}

export interface PoolOptions {
  maxConnections?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface ForwardRule {
  id: string;
  type: 'local' | 'remote' | 'dynamic';
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  state: 'active' | 'inactive' | 'error';
}

export interface SSHClientEvents {
  ready: () => void;
  close: () => void;
  error: (error: Error) => void;
  timeout: () => void;
}

export interface ConnectionPoolEvents {
  'connection:added': (id: string) => void;
  'connection:removed': (id: string) => void;
  'connection:ready': (id: string) => void;
  'connection:error': (id: string, error: Error) => void;
  'connection:state': (id: string, state: ConnectionState) => void;
}

export interface PortForwarderEvents {
  'forward:started': (rule: ForwardRule) => void;
  'forward:stopped': (id: string) => void;
  'forward:error': (id: string, error: Error) => void;
  'forward:connection': (id: string, info: { srcIP: string; srcPort: number }) => void;
}
