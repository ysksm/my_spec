# SSH Command Tool 3 - 技術仕様書

## 1. アーキテクチャ概要

### 1.1 システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        ユーザーインターフェース層                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    CLI      │  │  GUI Server │  │   Web Frontend          │ │
│  │ (Commander) │  │   (Hono)    │  │  (HTML/CSS/JS)          │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼─────────────────────┼───────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                         コア層 (Core Package)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SessionManager                        │   │
│  │         (SSH + PortForward + CDP の統合管理)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│            │                    │                    │          │
│            ▼                    ▼                    ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  SSH Module  │    │  CDP Module  │    │  Config Module   │  │
│  │              │    │              │    │                  │  │
│  │ • SSHClient  │    │ • CDPClient  │    │ • ConfigManager  │  │
│  │ • ConnPool   │    │ • Browser    │    │ • SecureStorage  │  │
│  │ • PortFwd    │    │ • Page       │    │ • Validation     │  │
│  │ • Auth       │    │ • Network    │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│            │                    │                    │          │
│            ▼                    ▼                    ▼          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Event System                          │   │
│  │                  (EventEmitter3)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Types / Interfaces                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 パッケージ構成

```
ssh-command-tool3/
├── packages/
│   ├── core/                    # コアライブラリ（UI非依存）
│   │   ├── src/
│   │   │   ├── ssh/            # SSH接続管理
│   │   │   │   ├── client.ts
│   │   │   │   ├── pool.ts
│   │   │   │   ├── port-forward.ts
│   │   │   │   ├── auth.ts
│   │   │   │   └── index.ts
│   │   │   ├── cdp/            # Chrome DevTools Protocol
│   │   │   │   ├── client.ts
│   │   │   │   ├── browser.ts
│   │   │   │   ├── page.ts
│   │   │   │   ├── network.ts
│   │   │   │   ├── screenshot.ts
│   │   │   │   └── index.ts
│   │   │   ├── session/        # 統合セッション管理
│   │   │   │   ├── manager.ts
│   │   │   │   ├── lifecycle.ts
│   │   │   │   └── index.ts
│   │   │   ├── config/         # 設定管理
│   │   │   │   ├── manager.ts
│   │   │   │   ├── schema.ts
│   │   │   │   ├── storage.ts
│   │   │   │   └── index.ts
│   │   │   ├── types/          # 型定義
│   │   │   │   ├── ssh.ts
│   │   │   │   ├── cdp.ts
│   │   │   │   ├── config.ts
│   │   │   │   ├── events.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── __tests__/          # ユニットテスト
│   │   └── package.json
│   │
│   ├── cli/                     # CLIアプリケーション
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── connect.ts
│   │   │   │   ├── browse.ts
│   │   │   │   ├── screenshot.ts
│   │   │   │   ├── network.ts
│   │   │   │   └── config.ts
│   │   │   ├── interactive/
│   │   │   │   └── menu.ts
│   │   │   ├── formatters/
│   │   │   │   └── output.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── gui/                     # Web GUI
│       ├── server/
│       │   ├── src/
│       │   │   ├── routes/
│       │   │   ├── middleware/
│       │   │   └── index.ts
│       │   └── package.json
│       └── frontend/
│           ├── src/
│           │   ├── components/
│           │   ├── pages/
│           │   └── main.ts
│           └── index.html
│
├── docs/                        # ドキュメント
├── docker-compose.yml           # 開発環境
└── package.json                 # ルートパッケージ
```

---

## 2. コアモジュール詳細設計

### 2.1 SSH Module

#### 2.1.1 SSHClient

```typescript
// packages/core/src/ssh/client.ts

import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'eventemitter3';

interface SSHClientEvents {
  ready: () => void;
  close: () => void;
  error: (error: Error) => void;
  timeout: () => void;
}

interface SSHClientOptions {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  timeout?: number;          // デフォルト: 10000ms
  keepAliveInterval?: number; // デフォルト: 5000ms
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class SSHClient extends EventEmitter<SSHClientEvents> {
  private client: Client;
  private connected: boolean = false;
  private keepAliveTimer?: Timer;

  constructor(private options: SSHClientOptions) {
    super();
    this.client = new Client();
    this.setupEventHandlers();
  }

  // 接続
  async connect(): Promise<void>;

  // 切断
  async disconnect(): Promise<void>;

  // コマンド実行
  async exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  // 接続状態確認
  isConnected(): boolean;

  // ストリーム取得（対話的コマンド用）
  async shell(): Promise<ClientChannel>;

  // Keep-Alive送信
  private startKeepAlive(): void;
  private stopKeepAlive(): void;
}
```

#### 2.1.2 ConnectionPool

```typescript
// packages/core/src/ssh/pool.ts

interface ConnectionInfo {
  id: string;
  name: string;
  client: SSHClient;
  state: ConnectionState;
  lastActivity: number;
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface ConnectionPoolEvents {
  'connection:added': (id: string) => void;
  'connection:removed': (id: string) => void;
  'connection:ready': (id: string) => void;
  'connection:error': (id: string, error: Error) => void;
  'connection:state': (id: string, state: ConnectionState) => void;
}

interface PoolOptions {
  maxConnections?: number;     // デフォルト: 10
  idleTimeout?: number;        // デフォルト: 300000ms (5分)
  autoReconnect?: boolean;     // デフォルト: true
  reconnectAttempts?: number;  // デフォルト: 3
  reconnectDelay?: number;     // デフォルト: 5000ms
}

export class ConnectionPool extends EventEmitter<ConnectionPoolEvents> {
  private connections: Map<string, ConnectionInfo>;

  constructor(options?: PoolOptions);

  // 接続追加
  async add(id: string, options: SSHClientOptions): Promise<SSHClient>;

  // 接続取得
  get(id: string): SSHClient | undefined;

  // 接続削除
  async remove(id: string): Promise<boolean>;

  // 全接続取得
  getAll(): ConnectionInfo[];

  // 全接続切断
  async disconnectAll(): Promise<void>;

  // コマンド実行（特定接続）
  async exec(id: string, command: string): Promise<ExecResult>;

  // コマンド実行（全接続）
  async execAll(command: string): Promise<Map<string, ExecResult>>;
}
```

#### 2.1.3 PortForwarder

```typescript
// packages/core/src/ssh/port-forward.ts

interface ForwardRule {
  id: string;
  type: 'local' | 'remote' | 'dynamic';
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  state: 'active' | 'inactive' | 'error';
}

interface PortForwarderEvents {
  'forward:started': (rule: ForwardRule) => void;
  'forward:stopped': (id: string) => void;
  'forward:error': (id: string, error: Error) => void;
  'forward:connection': (id: string, info: ConnectionInfo) => void;
}

export class PortForwarder extends EventEmitter<PortForwarderEvents> {
  constructor(private sshClient: SSHClient);

  // ローカルポートフォワード開始
  async startLocalForward(
    localPort: number,
    remoteHost: string,
    remotePort: number,
    localHost?: string
  ): Promise<ForwardRule>;

  // リモートポートフォワード開始
  async startRemoteForward(
    remotePort: number,
    localHost: string,
    localPort: number,
    remoteHost?: string
  ): Promise<ForwardRule>;

  // フォワード停止
  async stop(id: string): Promise<void>;

  // 全フォワード停止
  async stopAll(): Promise<void>;

  // アクティブなフォワード一覧
  getActiveForwards(): ForwardRule[];
}
```

### 2.2 CDP Module

#### 2.2.1 CDPClient

```typescript
// packages/core/src/cdp/client.ts

interface CDPClientOptions {
  host: string;               // デフォルト: 'localhost'
  port: number;               // デフォルト: 9222
  connectionTimeout?: number; // デフォルト: 5000ms
}

interface CDPClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  message: (method: string, params: unknown) => void;
}

export class CDPClient extends EventEmitter<CDPClientEvents> {
  private ws: WebSocket;
  private messageId: number = 0;
  private pendingMessages: Map<number, { resolve: Function; reject: Function }>;

  constructor(private options: CDPClientOptions);

  // 接続
  async connect(targetId?: string): Promise<void>;

  // 切断
  async disconnect(): Promise<void>;

  // CDPコマンド送信
  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;

  // イベント購読
  on<K extends keyof CDPClientEvents>(event: K, listener: CDPClientEvents[K]): this;

  // ターゲット一覧取得
  static async getTargets(host: string, port: number): Promise<Target[]>;
}
```

#### 2.2.2 BrowserController

```typescript
// packages/core/src/cdp/browser.ts

interface BrowserLaunchOptions {
  executablePath?: string;
  headless?: boolean;
  userDataDir?: string;
  debuggingPort?: number;
  debuggingAddress?: string;
  args?: string[];
}

interface BrowserInfo {
  pid: number;
  debuggingUrl: string;
  version: string;
}

export class BrowserController {
  constructor(private sshClient: SSHClient);

  // リモートでChromeを起動
  async launch(options?: BrowserLaunchOptions): Promise<BrowserInfo>;

  // Chrome終了
  async kill(pid: number): Promise<void>;

  // 実行中のChrome検出
  async findRunning(): Promise<BrowserInfo[]>;

  // Chromeパス検出
  async detectChromePath(): Promise<string>;

  // バージョン取得
  async getVersion(): Promise<string>;
}
```

#### 2.2.3 PageController

```typescript
// packages/core/src/cdp/page.ts

interface PageEvents {
  'load': () => void;
  'domcontentloaded': () => void;
  'error': (error: Error) => void;
  'console': (message: ConsoleMessage) => void;
}

interface NavigateOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

interface ScreenshotOptions {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;         // 0-100 (JPEG/WebPのみ)
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
}

export class PageController extends EventEmitter<PageEvents> {
  constructor(private cdpClient: CDPClient);

  // ナビゲーション
  async navigate(url: string, options?: NavigateOptions): Promise<void>;

  // リロード
  async reload(): Promise<void>;

  // 戻る/進む
  async goBack(): Promise<void>;
  async goForward(): Promise<void>;

  // スクリーンショット
  async screenshot(options?: ScreenshotOptions): Promise<Buffer>;

  // PDF出力
  async pdf(options?: PDFOptions): Promise<Buffer>;

  // JavaScript実行
  async evaluate<T = unknown>(expression: string): Promise<T>;

  // DOM要素取得
  async querySelector(selector: string): Promise<ElementHandle | null>;
  async querySelectorAll(selector: string): Promise<ElementHandle[]>;

  // 現在のURL取得
  async getUrl(): Promise<string>;

  // タイトル取得
  async getTitle(): Promise<string>;
}
```

#### 2.2.4 NetworkMonitor

```typescript
// packages/core/src/cdp/network.ts

interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  resourceType: string;
}

interface NetworkResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  contentLength?: number;
  timing?: ResourceTiming;
}

interface NetworkEntry {
  request: NetworkRequest;
  response?: NetworkResponse;
  responseBody?: string;
  error?: string;
  duration?: number;
}

interface NetworkMonitorEvents {
  'request': (request: NetworkRequest) => void;
  'response': (response: NetworkResponse) => void;
  'requestFailed': (id: string, error: string) => void;
  'requestFinished': (entry: NetworkEntry) => void;
}

export class NetworkMonitor extends EventEmitter<NetworkMonitorEvents> {
  private entries: Map<string, NetworkEntry>;
  private recording: boolean = false;

  constructor(private cdpClient: CDPClient);

  // 監視開始
  async start(): Promise<void>;

  // 監視停止
  async stop(): Promise<void>;

  // 記録クリア
  clear(): void;

  // 全エントリー取得
  getEntries(): NetworkEntry[];

  // HAR形式でエクスポート
  exportHAR(): HARLog;

  // JSON形式でエクスポート
  exportJSON(): string;

  // 特定リクエストのボディ取得
  async getResponseBody(requestId: string): Promise<string>;
}
```

### 2.3 Session Module

```typescript
// packages/core/src/session/manager.ts

interface SessionOptions {
  connection: SSHClientOptions;
  browser?: BrowserLaunchOptions;
  portForward?: {
    localPort: number;
    remotePort: number;
  };
}

interface SessionState {
  ssh: 'disconnected' | 'connecting' | 'connected';
  portForward: 'inactive' | 'active';
  browser: 'stopped' | 'starting' | 'running';
  cdp: 'disconnected' | 'connecting' | 'connected';
}

interface SessionEvents {
  'state:change': (state: SessionState) => void;
  'ready': () => void;
  'error': (error: Error) => void;
  'closed': () => void;
}

export class SessionManager extends EventEmitter<SessionEvents> {
  private sshClient: SSHClient;
  private portForwarder: PortForwarder;
  private browserController: BrowserController;
  private cdpClient: CDPClient;
  private pageController: PageController;
  private networkMonitor: NetworkMonitor;

  constructor(private options: SessionOptions);

  // セッション開始（SSH→ブラウザ起動→ポートフォワード→CDP接続）
  async start(): Promise<void>;

  // セッション終了（逆順でクリーンアップ）
  async stop(): Promise<void>;

  // 各コンポーネントへのアクセサ
  get ssh(): SSHClient;
  get page(): PageController;
  get network(): NetworkMonitor;
  get state(): SessionState;

  // 便利メソッド
  async navigateTo(url: string): Promise<void>;
  async takeScreenshot(path?: string): Promise<Buffer>;
  async startNetworkRecording(): Promise<void>;
  async stopNetworkRecording(): Promise<NetworkEntry[]>;
}
```

### 2.4 Config Module

```typescript
// packages/core/src/config/schema.ts

interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  password?: string;           // 暗号化して保存
  privateKeyPath?: string;
  createdAt: number;
  updatedAt: number;
}

interface BrowserSettings {
  defaultHeadless: boolean;
  defaultPort: number;
  defaultUserDataDir: string;
  executablePath?: string;
}

interface AppConfig {
  version: string;
  connections: SavedConnection[];
  lastConnectionId?: string;
  browserSettings: BrowserSettings;
  portForwardDefaults: {
    localPort: number;
    remotePort: number;
  };
}

// packages/core/src/config/manager.ts

interface ConfigManagerOptions {
  configDir?: string;          // デフォルト: ~/.ssh-command-tool3
  encryptionKey?: string;      // パスワード暗号化用
}

export class ConfigManager {
  private config: AppConfig;
  private configPath: string;

  constructor(options?: ConfigManagerOptions);

  // 設定読み込み
  async load(): Promise<AppConfig>;

  // 設定保存
  async save(): Promise<void>;

  // 接続管理
  async addConnection(connection: Omit<SavedConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  async updateConnection(id: string, updates: Partial<SavedConnection>): Promise<void>;
  async removeConnection(id: string): Promise<boolean>;
  async getConnection(id: string): Promise<SavedConnection | undefined>;
  async getAllConnections(): Promise<SavedConnection[]>;

  // ブラウザ設定
  async getBrowserSettings(): Promise<BrowserSettings>;
  async updateBrowserSettings(settings: Partial<BrowserSettings>): Promise<void>;

  // エクスポート/インポート
  async export(path: string): Promise<void>;
  async import(path: string): Promise<void>;
}
```

---

## 3. CLI設計

### 3.1 コマンド構造

```
ssh-tool3
├── connect                    # SSH接続管理
│   ├── add                   # 接続追加
│   ├── list                  # 接続一覧
│   ├── remove <id>           # 接続削除
│   ├── test <id>             # 接続テスト
│   └── show <id>             # 接続詳細
│
├── session                    # セッション管理
│   ├── start [connection-id] # セッション開始
│   ├── stop                  # セッション終了
│   └── status                # 状態確認
│
├── browse                     # ブラウザ操作
│   ├── goto <url>            # URL移動
│   ├── back                  # 戻る
│   ├── forward               # 進む
│   ├── reload                # リロード
│   └── info                  # ページ情報
│
├── screenshot                 # スクリーンショット
│   ├── take [output]         # 撮影
│   └── batch <url-file>      # 一括撮影
│
├── network                    # ネットワーク監視
│   ├── start                 # 記録開始
│   ├── stop                  # 記録停止
│   ├── show                  # 記録表示
│   └── export <file>         # エクスポート
│
├── config                     # 設定管理
│   ├── show                  # 設定表示
│   ├── set <key> <value>     # 設定変更
│   └── reset                 # 初期化
│
└── interactive               # 対話モード
```

### 3.2 使用例

```bash
# 接続を追加
ssh-tool3 connect add \
  --name "dev-server" \
  --host "192.168.1.100" \
  --port 22 \
  --username "user" \
  --auth-type privateKey \
  --private-key ~/.ssh/id_rsa

# セッション開始
ssh-tool3 session start dev-server

# URLへ移動してスクリーンショット
ssh-tool3 browse goto https://example.com
ssh-tool3 screenshot take ./screenshot.png

# ネットワーク記録
ssh-tool3 network start
ssh-tool3 browse goto https://api.example.com
ssh-tool3 network stop
ssh-tool3 network export ./network.har

# 対話モード
ssh-tool3 interactive
```

---

## 4. GUI設計

### 4.1 APIエンドポイント

```
POST   /api/connections           # 接続追加
GET    /api/connections           # 接続一覧
GET    /api/connections/:id       # 接続詳細
PUT    /api/connections/:id       # 接続更新
DELETE /api/connections/:id       # 接続削除
POST   /api/connections/:id/test  # 接続テスト

POST   /api/session/start         # セッション開始
POST   /api/session/stop          # セッション終了
GET    /api/session/status        # 状態取得

POST   /api/browser/navigate      # ナビゲーション
POST   /api/browser/screenshot    # スクリーンショット
GET    /api/browser/info          # ページ情報

POST   /api/network/start         # 記録開始
POST   /api/network/stop          # 記録停止
GET    /api/network/entries       # エントリー取得
GET    /api/network/export        # エクスポート

WS     /api/events                # リアルタイムイベント
```

### 4.2 WebSocket イベント

```typescript
interface WSMessage {
  type: 'session:state' | 'network:request' | 'network:response' | 'console:log' | 'error';
  payload: unknown;
  timestamp: number;
}
```

---

## 5. 技術スタック

### 5.1 ランタイム・言語
| 項目 | 選定技術 | バージョン |
|------|----------|-----------|
| ランタイム | Bun | 1.1.0+ |
| 言語 | TypeScript | 5.4+ |

### 5.2 主要依存ライブラリ

| パッケージ | 用途 | バージョン |
|-----------|------|-----------|
| ssh2 | SSH接続 | ^1.15.0 |
| eventemitter3 | イベント管理 | ^5.0.1 |
| commander | CLI | ^12.0.0 |
| hono | HTTPサーバー | ^4.0.0 |
| chalk | ターミナル出力 | ^5.3.0 |
| inquirer | 対話入力 | ^9.2.0 |

### 5.3 開発ツール

| ツール | 用途 |
|--------|------|
| Bun test | ユニットテスト |
| Biome | Linter/Formatter |
| TypeScript | 型チェック |

---

## 6. エラーハンドリング

### 6.1 エラー分類

```typescript
// packages/core/src/errors.ts

export class SSHToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SSHToolError';
  }
}

// SSH関連
export class SSHConnectionError extends SSHToolError { code = 'SSH_CONNECTION_ERROR'; }
export class SSHAuthError extends SSHToolError { code = 'SSH_AUTH_ERROR'; }
export class SSHTimeoutError extends SSHToolError { code = 'SSH_TIMEOUT_ERROR'; }
export class SSHExecError extends SSHToolError { code = 'SSH_EXEC_ERROR'; }

// CDP関連
export class CDPConnectionError extends SSHToolError { code = 'CDP_CONNECTION_ERROR'; }
export class CDPTimeoutError extends SSHToolError { code = 'CDP_TIMEOUT_ERROR'; }
export class CDPProtocolError extends SSHToolError { code = 'CDP_PROTOCOL_ERROR'; }

// ブラウザ関連
export class BrowserLaunchError extends SSHToolError { code = 'BROWSER_LAUNCH_ERROR'; }
export class BrowserNotFoundError extends SSHToolError { code = 'BROWSER_NOT_FOUND'; }

// 設定関連
export class ConfigError extends SSHToolError { code = 'CONFIG_ERROR'; }
export class ValidationError extends SSHToolError { code = 'VALIDATION_ERROR'; }
```

### 6.2 リトライ戦略

```typescript
interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};
```

---

## 7. テスト戦略

### 7.1 テストレベル

| レベル | 対象 | ツール |
|--------|------|--------|
| ユニット | 各クラス・関数 | Bun test |
| 統合 | モジュール間連携 | Bun test + Docker |
| E2E | 全体フロー | Bun test + 実SSH環境 |

### 7.2 モック戦略

```typescript
// SSHClientのモック例
const mockSSHClient: SSHClient = {
  connect: async () => {},
  disconnect: async () => {},
  exec: async (cmd) => ({
    stdout: 'mocked output',
    stderr: '',
    exitCode: 0,
  }),
  isConnected: () => true,
};

// CDPClientのモック例
const mockCDPClient: CDPClient = {
  connect: async () => {},
  send: async (method, params) => ({ result: 'mocked' }),
  disconnect: async () => {},
};
```

---

## 8. セキュリティ考慮事項

### 8.1 認証情報の保護

1. **パスワード暗号化**: AES-256-GCMで暗号化して保存
2. **ファイルパーミッション**: 設定ファイルは0600で作成
3. **メモリ管理**: パスワードは使用後に可能な限り早くクリア

### 8.2 SSH接続

1. **ホストキー検証**: デフォルトで有効、無効化は明示的に
2. **タイムアウト**: 全接続にタイムアウト設定
3. **接続数制限**: 最大10接続に制限

---

## 9. 今後の拡張ポイント

1. **プラグインシステム**: カスタムコマンドの追加
2. **マルチブラウザ対応**: Firefox, Edgeへの対応
3. **スクリプト実行**: 自動化スクリプトのサポート
4. **メトリクス収集**: Prometheus形式でのメトリクス出力
5. **トレーシング**: OpenTelemetry統合
