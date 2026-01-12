import { EventEmitter } from 'eventemitter3';
import type { CDPClient } from './client';
import type {
  PageEvents,
  NavigateOptions,
  ScreenshotOptions,
  PDFOptions,
  ConsoleMessage,
} from '../types';
import { CDPTimeoutError, CDPProtocolError } from '../errors';

const DEFAULT_NAVIGATE_OPTIONS: Required<NavigateOptions> = {
  timeout: 30000,
  waitUntil: 'load',
};

const DEFAULT_SCREENSHOT_OPTIONS: Required<ScreenshotOptions> = {
  format: 'png',
  quality: 80,
  fullPage: false,
  clip: { x: 0, y: 0, width: 0, height: 0 },
};

export class PageController extends EventEmitter<PageEvents> {
  private frameId?: string;
  private loaderId?: string;

  constructor(private cdpClient: CDPClient) {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.cdpClient.on('message', (method, params: any) => {
      switch (method) {
        case 'Page.loadEventFired':
          this.emit('load');
          break;
        case 'Page.domContentEventFired':
          this.emit('domcontentloaded');
          break;
        case 'Page.frameNavigated':
          if (params.frame.parentId === undefined) {
            this.frameId = params.frame.id;
          }
          break;
        case 'Runtime.consoleAPICalled':
          this.emit('console', {
            type: params.type,
            text: params.args.map((arg: any) => arg.value ?? arg.description).join(' '),
            timestamp: params.timestamp,
            stackTrace: params.stackTrace?.callFrames?.map((f: any) => f.functionName),
          });
          break;
        case 'Runtime.exceptionThrown':
          this.emit('error', new Error(params.exceptionDetails.text));
          break;
      }
    });
  }

  async enable(): Promise<void> {
    await Promise.all([
      this.cdpClient.send('Page.enable'),
      this.cdpClient.send('Runtime.enable'),
      this.cdpClient.send('DOM.enable'),
    ]);
  }

  async navigate(url: string, options?: NavigateOptions): Promise<void> {
    const opts = { ...DEFAULT_NAVIGATE_OPTIONS, ...options };

    // Start navigation
    const navigateResult = await this.cdpClient.send<{ frameId: string; loaderId: string; errorText?: string }>(
      'Page.navigate',
      { url }
    );

    if (navigateResult.errorText) {
      throw new CDPProtocolError(`Navigation failed: ${navigateResult.errorText}`);
    }

    this.frameId = navigateResult.frameId;
    this.loaderId = navigateResult.loaderId;

    // Wait for the specified event
    await this.waitForLoadState(opts.waitUntil, opts.timeout);
  }

  async reload(): Promise<void> {
    await this.cdpClient.send('Page.reload');
    await this.waitForLoadState('load');
  }

  async goBack(): Promise<void> {
    const history = await this.cdpClient.send<{ currentIndex: number; entries: any[] }>(
      'Page.getNavigationHistory'
    );
    if (history.currentIndex > 0) {
      await this.cdpClient.send('Page.navigateToHistoryEntry', {
        entryId: history.entries[history.currentIndex - 1].id,
      });
      await this.waitForLoadState('load');
    }
  }

  async goForward(): Promise<void> {
    const history = await this.cdpClient.send<{ currentIndex: number; entries: any[] }>(
      'Page.getNavigationHistory'
    );
    if (history.currentIndex < history.entries.length - 1) {
      await this.cdpClient.send('Page.navigateToHistoryEntry', {
        entryId: history.entries[history.currentIndex + 1].id,
      });
      await this.waitForLoadState('load');
    }
  }

  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    const opts = { ...DEFAULT_SCREENSHOT_OPTIONS, ...options };

    const params: Record<string, unknown> = {
      format: opts.format,
    };

    if (opts.format === 'jpeg' || opts.format === 'webp') {
      params.quality = opts.quality;
    }

    if (opts.fullPage) {
      // Get the full page dimensions
      const layoutMetrics = await this.cdpClient.send<{
        contentSize: { width: number; height: number };
      }>('Page.getLayoutMetrics');

      params.clip = {
        x: 0,
        y: 0,
        width: layoutMetrics.contentSize.width,
        height: layoutMetrics.contentSize.height,
        scale: 1,
      };
      params.captureBeyondViewport = true;
    } else if (opts.clip && opts.clip.width > 0 && opts.clip.height > 0) {
      params.clip = { ...opts.clip, scale: 1 };
    }

    const result = await this.cdpClient.send<{ data: string }>('Page.captureScreenshot', params);
    return Buffer.from(result.data, 'base64');
  }

  async pdf(options?: PDFOptions): Promise<Buffer> {
    const params: Record<string, unknown> = {
      landscape: options?.landscape ?? false,
      displayHeaderFooter: options?.displayHeaderFooter ?? false,
      printBackground: options?.printBackground ?? true,
      scale: options?.scale ?? 1,
      paperWidth: options?.paperWidth ?? 8.5,
      paperHeight: options?.paperHeight ?? 11,
      marginTop: options?.marginTop ?? 0.4,
      marginBottom: options?.marginBottom ?? 0.4,
      marginLeft: options?.marginLeft ?? 0.4,
      marginRight: options?.marginRight ?? 0.4,
    };

    if (options?.pageRanges) {
      params.pageRanges = options.pageRanges;
    }

    const result = await this.cdpClient.send<{ data: string }>('Page.printToPDF', params);
    return Buffer.from(result.data, 'base64');
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.cdpClient.send<{
      result: { value?: T; type: string; description?: string };
      exceptionDetails?: { text: string };
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new CDPProtocolError(`Evaluation failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value as T;
  }

  async querySelector(selector: string): Promise<number | null> {
    const document = await this.cdpClient.send<{ root: { nodeId: number } }>('DOM.getDocument');
    const result = await this.cdpClient.send<{ nodeId: number }>('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector,
    });

    return result.nodeId > 0 ? result.nodeId : null;
  }

  async querySelectorAll(selector: string): Promise<number[]> {
    const document = await this.cdpClient.send<{ root: { nodeId: number } }>('DOM.getDocument');
    const result = await this.cdpClient.send<{ nodeIds: number[] }>('DOM.querySelectorAll', {
      nodeId: document.root.nodeId,
      selector,
    });

    return result.nodeIds;
  }

  async getUrl(): Promise<string> {
    const result = await this.evaluate<string>('window.location.href');
    return result;
  }

  async getTitle(): Promise<string> {
    const result = await this.evaluate<string>('document.title');
    return result;
  }

  async getContent(): Promise<string> {
    const result = await this.evaluate<string>('document.documentElement.outerHTML');
    return result;
  }

  async setViewport(width: number, height: number, deviceScaleFactor = 1): Promise<void> {
    await this.cdpClient.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false,
    });
  }

  async click(selector: string): Promise<void> {
    await this.evaluate(`document.querySelector('${selector}').click()`);
  }

  async type(selector: string, text: string): Promise<void> {
    await this.evaluate(`
      const el = document.querySelector('${selector}');
      el.value = '${text.replace(/'/g, "\\'")}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `);
  }

  async waitForSelector(selector: string, timeout = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const nodeId = await this.querySelector(selector);
      if (nodeId) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new CDPTimeoutError(`Timeout waiting for selector: ${selector}`);
  }

  private async waitForLoadState(
    state: 'load' | 'domcontentloaded' | 'networkidle',
    timeout = 30000
  ): Promise<void> {
    if (state === 'networkidle') {
      // Wait for network to be idle
      await this.waitForNetworkIdle(timeout);
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off('load', onLoad);
        this.off('domcontentloaded', onDomContentLoaded);
        reject(new CDPTimeoutError(`Timeout waiting for ${state}`));
      }, timeout);

      const onLoad = () => {
        if (state === 'load') {
          clearTimeout(timeoutId);
          this.off('load', onLoad);
          this.off('domcontentloaded', onDomContentLoaded);
          resolve();
        }
      };

      const onDomContentLoaded = () => {
        if (state === 'domcontentloaded') {
          clearTimeout(timeoutId);
          this.off('load', onLoad);
          this.off('domcontentloaded', onDomContentLoaded);
          resolve();
        }
      };

      this.on('load', onLoad);
      this.on('domcontentloaded', onDomContentLoaded);
    });
  }

  private async waitForNetworkIdle(timeout = 30000, idleTime = 500): Promise<void> {
    // Simple implementation: wait for a period with no network activity
    let lastActivityTime = Date.now();
    const startTime = Date.now();

    const onNetworkActivity = () => {
      lastActivityTime = Date.now();
    };

    this.cdpClient.on('message', (method) => {
      if (method.startsWith('Network.')) {
        onNetworkActivity();
      }
    });

    while (Date.now() - startTime < timeout) {
      if (Date.now() - lastActivityTime >= idleTime) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new CDPTimeoutError('Timeout waiting for network idle');
  }
}
