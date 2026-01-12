import { describe, expect, test } from 'bun:test';
import {
  generateId,
  sleep,
  formatBytes,
  formatDuration,
  isValidUrl,
  normalizeUrl,
  sanitizeForShell,
  buildChromeArgs,
} from '../src/utils';

describe('generateId', () => {
  test('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  test('should generate UUIDs', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('sleep', () => {
  test('should wait for specified time', async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('formatBytes', () => {
  test('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0.00 B');
    expect(formatBytes(500)).toBe('500.00 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });
});

describe('formatDuration', () => {
  test('should format durations correctly', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(5500)).toBe('5.50s');
    expect(formatDuration(60000)).toBe('1.00m');
    expect(formatDuration(90000)).toBe('1.50m');
  });
});

describe('isValidUrl', () => {
  test('should validate URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  test('should add https prefix if missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });
});

describe('sanitizeForShell', () => {
  test('should escape special characters', () => {
    expect(sanitizeForShell('hello world')).toBe('hello world');
    expect(sanitizeForShell('hello; world')).toBe('hello\\; world');
    expect(sanitizeForShell('hello | world')).toBe('hello \\| world');
    expect(sanitizeForShell('$(whoami)')).toBe('\\$\\(whoami\\)');
  });
});

describe('buildChromeArgs', () => {
  test('should build basic Chrome args', () => {
    const args = buildChromeArgs({});
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--disable-extensions');
  });

  test('should add headless flag', () => {
    const args = buildChromeArgs({ headless: true });
    expect(args).toContain('--headless=new');
  });

  test('should add debugging port', () => {
    const args = buildChromeArgs({ debuggingPort: 9222 });
    expect(args).toContain('--remote-debugging-port=9222');
  });

  test('should add user data dir', () => {
    const args = buildChromeArgs({ userDataDir: '/tmp/chrome' });
    expect(args).toContain('--user-data-dir=/tmp/chrome');
  });

  test('should add additional args', () => {
    const args = buildChromeArgs({ additionalArgs: ['--custom-flag'] });
    expect(args).toContain('--custom-flag');
  });
});
