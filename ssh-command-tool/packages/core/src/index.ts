// SSH Module
export { SSHClient, ConnectionPool, PortForwarder } from './ssh';
export {
  loadPrivateKey,
  detectKeyType,
  isKeyEncrypted,
  getDefaultKeyPaths,
  parseSSHConfig,
  resolveSSHHost,
  validatePrivateKey,
} from './ssh';
export type { KeyType, PrivateKeyInfo, SSHConfigHost } from './ssh';

// CDP Module
export { CDPClient, BrowserController, PageController, NetworkMonitor, ScreenshotHelper } from './cdp';
export type { BatchScreenshotOptions, ScreenshotResult } from './cdp';

// Session Module
export { SessionManager, SessionLifecycle } from './session';
export type { SessionOptions, LifecycleHooks } from './session';

// Config Module
export { ConfigManager, SecureStorage, isEncryptedValue } from './config';
export {
  DEFAULT_CONFIG,
  DEFAULT_BROWSER_SETTINGS,
  DEFAULT_PORT_FORWARD_DEFAULTS,
  validateConnection,
  validateConfig,
} from './config';

// Types
export * from './types';

// Errors
export * from './errors';

// Utilities
export {
  generateId,
  sleep,
  withRetry,
  fileExists,
  readPrivateKey,
  isEncryptedPrivateKey,
  expandPath,
  getDefaultConfigDir,
  formatBytes,
  formatDuration,
  sanitizeForShell,
  buildChromeArgs,
  isValidUrl,
  normalizeUrl,
} from './utils';
export type { RetryOptions } from './utils';
