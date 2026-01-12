import type { AppConfig, SavedConnection, BrowserSettings, PortForwardDefaults } from '../types';
import { ValidationError } from '../errors';

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  defaultHeadless: true,
  defaultPort: 9222,
  defaultUserDataDir: '/tmp/chrome-remote-debug',
};

export const DEFAULT_PORT_FORWARD_DEFAULTS: PortForwardDefaults = {
  localPort: 9222,
  remotePort: 9222,
};

export const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  connections: [],
  browserSettings: DEFAULT_BROWSER_SETTINGS,
  portForwardDefaults: DEFAULT_PORT_FORWARD_DEFAULTS,
};

export function validateConnection(connection: Partial<SavedConnection>): void {
  if (!connection.name || connection.name.trim() === '') {
    throw new ValidationError('Connection name is required', 'name');
  }

  if (!connection.host || connection.host.trim() === '') {
    throw new ValidationError('Host is required', 'host');
  }

  if (!connection.port || connection.port < 1 || connection.port > 65535) {
    throw new ValidationError('Port must be between 1 and 65535', 'port');
  }

  if (!connection.username || connection.username.trim() === '') {
    throw new ValidationError('Username is required', 'username');
  }

  if (!connection.authType || !['password', 'privateKey'].includes(connection.authType)) {
    throw new ValidationError('Auth type must be "password" or "privateKey"', 'authType');
  }

  if (connection.authType === 'password' && !connection.password) {
    throw new ValidationError('Password is required for password authentication', 'password');
  }

  if (connection.authType === 'privateKey' && !connection.privateKeyPath) {
    throw new ValidationError('Private key path is required for key authentication', 'privateKeyPath');
  }
}

export function validateConfig(config: Partial<AppConfig>): AppConfig {
  const validated: AppConfig = {
    version: config.version || DEFAULT_CONFIG.version,
    connections: [],
    browserSettings: {
      ...DEFAULT_BROWSER_SETTINGS,
      ...config.browserSettings,
    },
    portForwardDefaults: {
      ...DEFAULT_PORT_FORWARD_DEFAULTS,
      ...config.portForwardDefaults,
    },
    lastConnectionId: config.lastConnectionId,
  };

  if (config.connections) {
    for (const conn of config.connections) {
      try {
        validateConnection(conn);
        validated.connections.push(conn as SavedConnection);
      } catch {
        // Skip invalid connections during validation
        console.warn(`Skipping invalid connection: ${conn.name}`);
      }
    }
  }

  return validated;
}

export function migrateConfig(config: Record<string, unknown>, fromVersion: string): AppConfig {
  // Add migration logic here for future versions
  // For now, just validate and return
  return validateConfig(config as Partial<AppConfig>);
}
