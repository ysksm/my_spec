export { SSHClient } from './client';
export { ConnectionPool } from './pool';
export { PortForwarder } from './port-forward';
export {
  loadPrivateKey,
  detectKeyType,
  isKeyEncrypted,
  getDefaultKeyPaths,
  parseSSHConfig,
  resolveSSHHost,
  validatePrivateKey,
  type KeyType,
  type PrivateKeyInfo,
  type SSHConfigHost,
} from './auth';
