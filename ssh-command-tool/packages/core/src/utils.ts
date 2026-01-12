import { randomUUID } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export function generateId(): string {
  return randomUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < opts.maxAttempts) {
        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
      }
    }
  }

  throw lastError;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readPrivateKey(keyPath: string): Promise<Buffer> {
  const expandedPath = keyPath.replace(/^~/, homedir());
  return await readFile(expandedPath);
}

export function isEncryptedPrivateKey(keyContent: Buffer | string): boolean {
  const content = typeof keyContent === 'string' ? keyContent : keyContent.toString('utf-8');
  return content.includes('ENCRYPTED') || content.includes('Proc-Type: 4,ENCRYPTED');
}

export function expandPath(path: string): string {
  return path.replace(/^~/, homedir());
}

export function getDefaultConfigDir(): string {
  return join(homedir(), '.ssh-command-tool3');
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export function parseSSHConfigHost(
  host: string
): { hostname: string; port?: number; username?: string } | null {
  const sshConfigPath = join(homedir(), '.ssh', 'config');
  // Note: Actual SSH config parsing would require reading the file
  // This is a simplified implementation
  return { hostname: host };
}

export function sanitizeForShell(input: string): string {
  return input.replace(/[;&|`$(){}[\]<>\\!#*?'"]/g, '\\$&');
}

export function buildChromeArgs(options: {
  headless?: boolean;
  debuggingPort?: number;
  debuggingAddress?: string;
  userDataDir?: string;
  additionalArgs?: string[];
}): string[] {
  const args: string[] = [];

  if (options.headless) {
    args.push('--headless=new');
  }

  if (options.debuggingPort) {
    args.push(`--remote-debugging-port=${options.debuggingPort}`);
  }

  if (options.debuggingAddress) {
    args.push(`--remote-debugging-address=${options.debuggingAddress}`);
  }

  if (options.userDataDir) {
    args.push(`--user-data-dir=${options.userDataDir}`);
  }

  // Common flags for automation
  args.push(
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--no-first-run',
    '--safebrowsing-disable-auto-update'
  );

  if (options.additionalArgs) {
    args.push(...options.additionalArgs);
  }

  return args;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}
