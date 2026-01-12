import type { AuthType } from './ssh';

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  privateKeyPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrowserSettings {
  defaultHeadless: boolean;
  defaultPort: number;
  defaultUserDataDir: string;
  executablePath?: string;
}

export interface PortForwardDefaults {
  localPort: number;
  remotePort: number;
}

export interface AppConfig {
  version: string;
  connections: SavedConnection[];
  lastConnectionId?: string;
  browserSettings: BrowserSettings;
  portForwardDefaults: PortForwardDefaults;
}

export interface ConfigManagerOptions {
  configDir?: string;
  encryptionKey?: string;
}
