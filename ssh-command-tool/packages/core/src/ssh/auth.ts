import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { expandPath, fileExists } from '../utils';
import { SSHAuthError, ValidationError } from '../errors';

export type KeyType = 'rsa' | 'ed25519' | 'ecdsa' | 'dsa' | 'unknown';

export interface PrivateKeyInfo {
  type: KeyType;
  encrypted: boolean;
  path: string;
  content: Buffer;
}

export async function loadPrivateKey(keyPath: string): Promise<PrivateKeyInfo> {
  const expandedPath = expandPath(keyPath);

  if (!(await fileExists(expandedPath))) {
    throw new SSHAuthError(`Private key file not found: ${keyPath}`);
  }

  const content = await readFile(expandedPath);
  const type = detectKeyType(content);
  const encrypted = isKeyEncrypted(content);

  return {
    type,
    encrypted,
    path: expandedPath,
    content,
  };
}

export function detectKeyType(keyContent: Buffer | string): KeyType {
  const content = typeof keyContent === 'string' ? keyContent : keyContent.toString('utf-8');

  if (content.includes('BEGIN RSA PRIVATE KEY') || content.includes('BEGIN OPENSSH PRIVATE KEY')) {
    // OpenSSH format can contain any key type, need deeper inspection
    if (content.includes('BEGIN OPENSSH PRIVATE KEY')) {
      // Check for key type markers in the OpenSSH format
      if (content.includes('ssh-ed25519')) return 'ed25519';
      if (content.includes('ecdsa-sha2')) return 'ecdsa';
      if (content.includes('ssh-rsa')) return 'rsa';
      if (content.includes('ssh-dss')) return 'dsa';
      return 'unknown';
    }
    return 'rsa';
  }

  if (content.includes('BEGIN EC PRIVATE KEY')) return 'ecdsa';
  if (content.includes('BEGIN DSA PRIVATE KEY')) return 'dsa';

  return 'unknown';
}

export function isKeyEncrypted(keyContent: Buffer | string): boolean {
  const content = typeof keyContent === 'string' ? keyContent : keyContent.toString('utf-8');

  // PEM format encryption indicator
  if (content.includes('Proc-Type: 4,ENCRYPTED')) return true;

  // Check for ENCRYPTED keyword in header
  if (content.includes('ENCRYPTED')) return true;

  // OpenSSH new format encryption check
  if (content.includes('BEGIN OPENSSH PRIVATE KEY')) {
    // In OpenSSH format, encrypted keys have "aes256-ctr" or similar in the binary section
    // Simple heuristic: encrypted keys are longer and have specific patterns
    const lines = content.split('\n').filter((l) => !l.startsWith('-----') && l.trim());
    const decoded = Buffer.from(lines.join(''), 'base64').toString('utf-8');
    if (decoded.includes('aes') || decoded.includes('bcrypt')) {
      return true;
    }
  }

  return false;
}

export async function getDefaultKeyPaths(): Promise<string[]> {
  const sshDir = join(homedir(), '.ssh');
  const defaultKeys = [
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    'id_dsa',
  ];

  const existingKeys: string[] = [];
  for (const key of defaultKeys) {
    const keyPath = join(sshDir, key);
    if (await fileExists(keyPath)) {
      existingKeys.push(keyPath);
    }
  }

  return existingKeys;
}

export interface SSHConfigHost {
  host: string;
  hostname?: string;
  port?: number;
  user?: string;
  identityFile?: string;
  identitiesOnly?: boolean;
}

export async function parseSSHConfig(): Promise<Map<string, SSHConfigHost>> {
  const configPath = join(homedir(), '.ssh', 'config');
  const hosts = new Map<string, SSHConfigHost>();

  if (!(await fileExists(configPath))) {
    return hosts;
  }

  const content = await readFile(configPath, 'utf-8');
  const lines = content.split('\n');

  let currentHost: SSHConfigHost | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      continue;
    }

    const [key, ...valueParts] = trimmed.split(/\s+/);
    const value = valueParts.join(' ');
    const lowerKey = key.toLowerCase();

    if (lowerKey === 'host') {
      if (currentHost) {
        hosts.set(currentHost.host, currentHost);
      }
      currentHost = { host: value };
    } else if (currentHost) {
      switch (lowerKey) {
        case 'hostname':
          currentHost.hostname = value;
          break;
        case 'port':
          currentHost.port = parseInt(value, 10);
          break;
        case 'user':
          currentHost.user = value;
          break;
        case 'identityfile':
          currentHost.identityFile = expandPath(value);
          break;
        case 'identitiesonly':
          currentHost.identitiesOnly = value.toLowerCase() === 'yes';
          break;
      }
    }
  }

  if (currentHost) {
    hosts.set(currentHost.host, currentHost);
  }

  return hosts;
}

export async function resolveSSHHost(
  hostAlias: string
): Promise<{ host: string; port: number; username?: string; privateKeyPath?: string }> {
  const sshConfig = await parseSSHConfig();
  const config = sshConfig.get(hostAlias);

  if (config) {
    return {
      host: config.hostname || hostAlias,
      port: config.port || 22,
      username: config.user,
      privateKeyPath: config.identityFile,
    };
  }

  return {
    host: hostAlias,
    port: 22,
  };
}

export function validatePrivateKey(keyContent: Buffer | string): void {
  const content = typeof keyContent === 'string' ? keyContent : keyContent.toString('utf-8');

  if (!content.includes('PRIVATE KEY')) {
    throw new ValidationError('Invalid private key format: missing PRIVATE KEY header');
  }

  if (!content.includes('-----BEGIN') || !content.includes('-----END')) {
    throw new ValidationError('Invalid private key format: missing PEM boundaries');
  }
}
