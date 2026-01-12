import { EventEmitter } from 'eventemitter3';
import { SSHClient } from '../ssh/client';
import { PortForwarder } from '../ssh/port-forward';
import { CDPClient } from '../cdp/client';
import { BrowserController } from '../cdp/browser';
import { PageController } from '../cdp/page';
import { NetworkMonitor } from '../cdp/network';
import { ScreenshotHelper } from '../cdp/screenshot';
import type {
  SSHClientOptions,
  BrowserLaunchOptions,
  SessionState,
  SessionEvents,
  NetworkEntry,
  ScreenshotOptions,
} from '../types';
import { SessionError } from '../errors';

export interface SessionOptions {
  connection: SSHClientOptions;
  browser?: BrowserLaunchOptions;
  portForward?: {
    localPort: number;
    remotePort: number;
  };
}

const DEFAULT_PORT_FORWARD = {
  localPort: 9222,
  remotePort: 9222,
};

export class SessionManager extends EventEmitter<SessionEvents> {
  private sshClient: SSHClient;
  private portForwarder?: PortForwarder;
  private browserController?: BrowserController;
  private cdpClient?: CDPClient;
  private pageController?: PageController;
  private networkMonitor?: NetworkMonitor;
  private screenshotHelper?: ScreenshotHelper;

  private state: SessionState = {
    ssh: 'disconnected',
    portForward: 'inactive',
    browser: 'stopped',
    cdp: 'disconnected',
  };

  constructor(private options: SessionOptions) {
    super();
    this.sshClient = new SSHClient(options.connection);
    this.setupSSHEvents();
  }

  private setupSSHEvents(): void {
    this.sshClient.on('ready', () => {
      this.updateState({ ssh: 'connected' });
    });

    this.sshClient.on('close', () => {
      this.updateState({ ssh: 'disconnected' });
      this.emit('closed');
    });

    this.sshClient.on('error', (error) => {
      this.updateState({ ssh: 'disconnected' });
      this.emit('error', error);
    });
  }

  async start(): Promise<void> {
    try {
      // Step 1: Connect SSH
      this.updateState({ ssh: 'connecting' });
      await this.sshClient.connect();

      // Step 2: Start browser on remote
      this.updateState({ browser: 'starting' });
      this.browserController = new BrowserController(this.sshClient);
      const browserInfo = await this.browserController.launch(this.options.browser);

      // Step 3: Setup port forwarding
      this.updateState({ portForward: 'inactive' });
      this.portForwarder = new PortForwarder(this.sshClient);
      const portForwardOpts = this.options.portForward || DEFAULT_PORT_FORWARD;
      await this.portForwarder.startLocalForward(
        portForwardOpts.localPort,
        '127.0.0.1',
        portForwardOpts.remotePort
      );
      this.updateState({ portForward: 'active', browser: 'running' });

      // Step 4: Connect CDP
      this.updateState({ cdp: 'connecting' });
      this.cdpClient = new CDPClient({
        host: 'localhost',
        port: portForwardOpts.localPort,
      });
      await this.cdpClient.connect();

      // Initialize controllers
      this.pageController = new PageController(this.cdpClient);
      await this.pageController.enable();
      this.networkMonitor = new NetworkMonitor(this.cdpClient);
      this.screenshotHelper = new ScreenshotHelper(this.pageController);

      this.updateState({ cdp: 'connected' });
      this.emit('ready');
    } catch (error) {
      await this.cleanup();
      throw new SessionError(
        `Failed to start session: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async stop(): Promise<void> {
    await this.cleanup();
    this.emit('closed');
  }

  private async cleanup(): Promise<void> {
    // Cleanup in reverse order

    // 1. Disconnect CDP
    if (this.cdpClient?.isConnected()) {
      try {
        await this.cdpClient.disconnect();
      } catch {
        // Ignore
      }
    }
    this.cdpClient = undefined;
    this.pageController = undefined;
    this.networkMonitor = undefined;
    this.screenshotHelper = undefined;
    this.updateState({ cdp: 'disconnected' });

    // 2. Stop port forwarding
    if (this.portForwarder) {
      try {
        await this.portForwarder.stopAll();
      } catch {
        // Ignore
      }
    }
    this.portForwarder = undefined;
    this.updateState({ portForward: 'inactive' });

    // 3. Kill browser
    if (this.browserController) {
      try {
        await this.browserController.cleanup();
      } catch {
        // Ignore
      }
    }
    this.browserController = undefined;
    this.updateState({ browser: 'stopped' });

    // 4. Disconnect SSH
    if (this.sshClient.isConnected()) {
      try {
        await this.sshClient.disconnect();
      } catch {
        // Ignore
      }
    }
    this.updateState({ ssh: 'disconnected' });
  }

  private updateState(partialState: Partial<SessionState>): void {
    this.state = { ...this.state, ...partialState };
    this.emit('state:change', this.state);
  }

  // Accessors
  get ssh(): SSHClient {
    return this.sshClient;
  }

  get page(): PageController {
    if (!this.pageController) {
      throw new SessionError('Session not started or page controller not available');
    }
    return this.pageController;
  }

  get network(): NetworkMonitor {
    if (!this.networkMonitor) {
      throw new SessionError('Session not started or network monitor not available');
    }
    return this.networkMonitor;
  }

  get screenshot(): ScreenshotHelper {
    if (!this.screenshotHelper) {
      throw new SessionError('Session not started or screenshot helper not available');
    }
    return this.screenshotHelper;
  }

  get browser(): BrowserController {
    if (!this.browserController) {
      throw new SessionError('Session not started or browser controller not available');
    }
    return this.browserController;
  }

  get cdp(): CDPClient {
    if (!this.cdpClient) {
      throw new SessionError('Session not started or CDP client not available');
    }
    return this.cdpClient;
  }

  getState(): SessionState {
    return { ...this.state };
  }

  isReady(): boolean {
    return (
      this.state.ssh === 'connected' &&
      this.state.portForward === 'active' &&
      this.state.browser === 'running' &&
      this.state.cdp === 'connected'
    );
  }

  // Convenience methods
  async navigateTo(url: string): Promise<void> {
    if (!this.isReady()) {
      throw new SessionError('Session is not ready');
    }
    await this.page.navigate(url);
  }

  async takeScreenshot(path?: string, options?: ScreenshotOptions): Promise<Buffer> {
    if (!this.isReady()) {
      throw new SessionError('Session is not ready');
    }

    if (path) {
      await this.screenshot.takeAndSave(path, options);
      return this.screenshot.take(options);
    }

    return this.screenshot.take(options);
  }

  async startNetworkRecording(): Promise<void> {
    if (!this.isReady()) {
      throw new SessionError('Session is not ready');
    }
    await this.network.start();
  }

  async stopNetworkRecording(): Promise<NetworkEntry[]> {
    if (!this.networkMonitor) {
      throw new SessionError('Network monitor not available');
    }
    await this.network.stop();
    return this.network.getEntries();
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.state.ssh !== 'connected') {
      throw new SessionError('SSH is not connected');
    }
    return this.sshClient.exec(command);
  }

  async evaluateScript<T = unknown>(expression: string): Promise<T> {
    if (!this.isReady()) {
      throw new SessionError('Session is not ready');
    }
    return this.page.evaluate<T>(expression);
  }
}
