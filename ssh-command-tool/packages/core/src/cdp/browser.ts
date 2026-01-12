import type { SSHClient } from '../ssh/client';
import type { BrowserLaunchOptions, BrowserInfo } from '../types';
import { BrowserLaunchError, BrowserNotFoundError } from '../errors';
import { buildChromeArgs, sleep } from '../utils';

const CHROME_PATHS = {
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/opt/google/chrome/google-chrome',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
};

const DEFAULT_OPTIONS: Required<BrowserLaunchOptions> = {
  executablePath: '',
  headless: true,
  userDataDir: '/tmp/chrome-remote-debug',
  debuggingPort: 9222,
  debuggingAddress: '127.0.0.1',
  args: [],
};

export class BrowserController {
  private browserPid?: number;

  constructor(private sshClient: SSHClient) {}

  async launch(options: BrowserLaunchOptions = {}): Promise<BrowserInfo> {
    if (!this.sshClient.isConnected()) {
      throw new BrowserLaunchError('SSH client is not connected');
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Detect Chrome path if not provided
    if (!opts.executablePath) {
      opts.executablePath = await this.detectChromePath();
    }

    // Build Chrome arguments
    const args = buildChromeArgs({
      headless: opts.headless,
      debuggingPort: opts.debuggingPort,
      debuggingAddress: opts.debuggingAddress,
      userDataDir: opts.userDataDir,
      additionalArgs: opts.args,
    });

    // Create user data directory
    await this.sshClient.exec(`mkdir -p "${opts.userDataDir}"`);

    // Kill any existing Chrome instances using the same debugging port
    try {
      await this.sshClient.exec(
        `pkill -f "remote-debugging-port=${opts.debuggingPort}" || true`
      );
      await sleep(500);
    } catch {
      // Ignore errors if no process found
    }

    // Launch Chrome in background
    const command = `nohup "${opts.executablePath}" ${args.join(' ')} > /dev/null 2>&1 & echo $!`;
    const result = await this.sshClient.exec(command);

    const pid = parseInt(result.stdout.trim(), 10);
    if (isNaN(pid)) {
      throw new BrowserLaunchError(`Failed to get Chrome PID: ${result.stderr || result.stdout}`);
    }

    this.browserPid = pid;

    // Wait for Chrome to start
    const debuggingUrl = `http://${opts.debuggingAddress}:${opts.debuggingPort}`;
    await this.waitForChrome(debuggingUrl);

    // Get Chrome version
    const version = await this.getVersion();

    return {
      pid,
      debuggingUrl,
      version,
    };
  }

  async kill(pid?: number): Promise<void> {
    const targetPid = pid ?? this.browserPid;
    if (!targetPid) {
      return;
    }

    try {
      await this.sshClient.exec(`kill ${targetPid}`);
      await sleep(500);
      // Force kill if still running
      await this.sshClient.exec(`kill -9 ${targetPid} 2>/dev/null || true`);
    } catch {
      // Process might already be dead
    }

    if (targetPid === this.browserPid) {
      this.browserPid = undefined;
    }
  }

  async findRunning(): Promise<BrowserInfo[]> {
    if (!this.sshClient.isConnected()) {
      throw new BrowserLaunchError('SSH client is not connected');
    }

    const result = await this.sshClient.exec(
      'pgrep -a -f "remote-debugging-port" || true'
    );

    if (!result.stdout.trim()) {
      return [];
    }

    const browsers: BrowserInfo[] = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^(\d+)\s+.*remote-debugging-port=(\d+)/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const port = parseInt(match[2], 10);
        browsers.push({
          pid,
          debuggingUrl: `http://127.0.0.1:${port}`,
          version: 'unknown', // Would need to query CDP to get version
        });
      }
    }

    return browsers;
  }

  async detectChromePath(): Promise<string> {
    if (!this.sshClient.isConnected()) {
      throw new BrowserNotFoundError('SSH client is not connected');
    }

    // Detect OS
    const osResult = await this.sshClient.exec('uname');
    const os = osResult.stdout.trim().toLowerCase();

    const paths = os === 'darwin' ? CHROME_PATHS.darwin : CHROME_PATHS.linux;

    for (const path of paths) {
      const result = await this.sshClient.exec(`test -x "${path}" && echo "found" || true`);
      if (result.stdout.trim() === 'found') {
        return path;
      }
    }

    // Try using which
    const whichResult = await this.sshClient.exec('which google-chrome chromium chromium-browser 2>/dev/null | head -1');
    if (whichResult.stdout.trim()) {
      return whichResult.stdout.trim();
    }

    throw new BrowserNotFoundError(
      'Chrome/Chromium not found. Please install Chrome or specify executablePath'
    );
  }

  async getVersion(): Promise<string> {
    if (!this.sshClient.isConnected()) {
      return 'unknown';
    }

    try {
      const chromePath = await this.detectChromePath();
      const result = await this.sshClient.exec(`"${chromePath}" --version`);
      return result.stdout.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async cleanup(): Promise<void> {
    await this.kill();
  }

  getBrowserPid(): number | undefined {
    return this.browserPid;
  }

  private async waitForChrome(debuggingUrl: string, timeout = 10000): Promise<void> {
    const startTime = Date.now();
    const checkUrl = `${debuggingUrl}/json/version`;

    while (Date.now() - startTime < timeout) {
      try {
        // Use curl through SSH to check if Chrome is ready
        const result = await this.sshClient.exec(
          `curl -s -o /dev/null -w "%{http_code}" "${checkUrl}" 2>/dev/null || echo "000"`
        );
        if (result.stdout.trim() === '200') {
          return;
        }
      } catch {
        // Ignore errors during startup
      }
      await sleep(200);
    }

    throw new BrowserLaunchError(`Chrome did not start within ${timeout}ms`);
  }
}
