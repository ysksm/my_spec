export interface CDPClientOptions {
  host: string;
  port: number;
  connectionTimeout?: number;
}

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
}

export interface CDPClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  message: (method: string, params: unknown) => void;
}

export interface BrowserLaunchOptions {
  executablePath?: string;
  headless?: boolean;
  userDataDir?: string;
  debuggingPort?: number;
  debuggingAddress?: string;
  args?: string[];
}

export interface BrowserInfo {
  pid: number;
  debuggingUrl: string;
  version: string;
}

export interface NavigateOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
}

export interface PDFOptions {
  landscape?: boolean;
  displayHeaderFooter?: boolean;
  printBackground?: boolean;
  scale?: number;
  paperWidth?: number;
  paperHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  pageRanges?: string;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
  stackTrace?: string[];
}

export interface PageEvents {
  load: () => void;
  domcontentloaded: () => void;
  error: (error: Error) => void;
  console: (message: ConsoleMessage) => void;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  resourceType: string;
}

export interface ResourceTiming {
  requestTime: number;
  proxyStart: number;
  proxyEnd: number;
  dnsStart: number;
  dnsEnd: number;
  connectStart: number;
  connectEnd: number;
  sslStart: number;
  sslEnd: number;
  sendStart: number;
  sendEnd: number;
  receiveHeadersEnd: number;
}

export interface NetworkResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  contentLength?: number;
  timing?: ResourceTiming;
}

export interface NetworkEntry {
  request: NetworkRequest;
  response?: NetworkResponse;
  responseBody?: string;
  error?: string;
  duration?: number;
}

export interface NetworkMonitorEvents {
  request: (request: NetworkRequest) => void;
  response: (response: NetworkResponse) => void;
  requestFailed: (id: string, error: string) => void;
  requestFinished: (entry: NetworkEntry) => void;
}

export interface HARLog {
  version: string;
  creator: { name: string; version: string };
  entries: HAREntry[];
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: { name: string; value: string }[];
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: { name: string; value: string }[];
    content: { size: number; mimeType: string; text?: string };
  };
  timings: {
    send: number;
    wait: number;
    receive: number;
  };
}
