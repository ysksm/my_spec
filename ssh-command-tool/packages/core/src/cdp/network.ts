import { EventEmitter } from 'eventemitter3';
import type { CDPClient } from './client';
import type {
  NetworkMonitorEvents,
  NetworkRequest,
  NetworkResponse,
  NetworkEntry,
  HARLog,
  HAREntry,
} from '../types';

export class NetworkMonitor extends EventEmitter<NetworkMonitorEvents> {
  private entries = new Map<string, NetworkEntry>();
  private recording = false;

  constructor(private cdpClient: CDPClient) {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.cdpClient.on('message', (method, params: any) => {
      if (!this.recording) return;

      switch (method) {
        case 'Network.requestWillBeSent':
          this.handleRequestWillBeSent(params);
          break;
        case 'Network.responseReceived':
          this.handleResponseReceived(params);
          break;
        case 'Network.loadingFinished':
          this.handleLoadingFinished(params);
          break;
        case 'Network.loadingFailed':
          this.handleLoadingFailed(params);
          break;
      }
    });
  }

  async start(): Promise<void> {
    if (this.recording) return;

    await this.cdpClient.send('Network.enable', {
      maxTotalBufferSize: 10000000,
      maxResourceBufferSize: 5000000,
    });

    this.recording = true;
  }

  async stop(): Promise<void> {
    if (!this.recording) return;

    this.recording = false;
    await this.cdpClient.send('Network.disable');
  }

  clear(): void {
    this.entries.clear();
  }

  getEntries(): NetworkEntry[] {
    return Array.from(this.entries.values());
  }

  getEntry(requestId: string): NetworkEntry | undefined {
    return this.entries.get(requestId);
  }

  async getResponseBody(requestId: string): Promise<string> {
    const result = await this.cdpClient.send<{ body: string; base64Encoded: boolean }>(
      'Network.getResponseBody',
      { requestId }
    );

    if (result.base64Encoded) {
      return Buffer.from(result.body, 'base64').toString('utf-8');
    }

    return result.body;
  }

  exportHAR(): HARLog {
    const entries: HAREntry[] = [];

    for (const entry of this.entries.values()) {
      if (!entry.response) continue;

      const harEntry: HAREntry = {
        startedDateTime: new Date(entry.request.timestamp).toISOString(),
        time: entry.duration ?? 0,
        request: {
          method: entry.request.method,
          url: entry.request.url,
          headers: Object.entries(entry.request.headers).map(([name, value]) => ({
            name,
            value,
          })),
        },
        response: {
          status: entry.response.status,
          statusText: entry.response.statusText,
          headers: Object.entries(entry.response.headers).map(([name, value]) => ({
            name,
            value,
          })),
          content: {
            size: entry.response.contentLength ?? 0,
            mimeType: entry.response.mimeType,
            text: entry.responseBody,
          },
        },
        timings: {
          send: entry.response.timing?.sendEnd ?? 0,
          wait: entry.response.timing?.receiveHeadersEnd ?? 0,
          receive: entry.duration ?? 0,
        },
      };

      if (entry.request.postData) {
        harEntry.request.postData = {
          mimeType: entry.request.headers['content-type'] || 'application/octet-stream',
          text: entry.request.postData,
        };
      }

      entries.push(harEntry);
    }

    return {
      version: '1.2',
      creator: {
        name: 'ssh-command-tool3',
        version: '1.0.0',
      },
      entries,
    };
  }

  exportJSON(): string {
    return JSON.stringify(this.getEntries(), null, 2);
  }

  isRecording(): boolean {
    return this.recording;
  }

  private handleRequestWillBeSent(params: any): void {
    const request: NetworkRequest = {
      id: params.requestId,
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers,
      postData: params.request.postData,
      timestamp: params.timestamp * 1000,
      resourceType: params.type,
    };

    this.entries.set(params.requestId, { request });
    this.emit('request', request);
  }

  private handleResponseReceived(params: any): void {
    const entry = this.entries.get(params.requestId);
    if (!entry) return;

    const response: NetworkResponse = {
      id: params.requestId,
      status: params.response.status,
      statusText: params.response.statusText,
      headers: params.response.headers,
      mimeType: params.response.mimeType,
      contentLength: params.response.headers['content-length']
        ? parseInt(params.response.headers['content-length'], 10)
        : undefined,
      timing: params.response.timing,
    };

    entry.response = response;
    this.emit('response', response);
  }

  private handleLoadingFinished(params: any): void {
    const entry = this.entries.get(params.requestId);
    if (!entry) return;

    entry.duration = params.timestamp * 1000 - entry.request.timestamp;

    // Try to get response body
    this.getResponseBody(params.requestId)
      .then((body) => {
        entry.responseBody = body;
        this.emit('requestFinished', entry);
      })
      .catch(() => {
        // Some responses may not have bodies (e.g., 204, redirects)
        this.emit('requestFinished', entry);
      });
  }

  private handleLoadingFailed(params: any): void {
    const entry = this.entries.get(params.requestId);
    if (!entry) return;

    entry.error = params.errorText;
    entry.duration = params.timestamp * 1000 - entry.request.timestamp;

    this.emit('requestFailed', params.requestId, params.errorText);
    this.emit('requestFinished', entry);
  }
}
