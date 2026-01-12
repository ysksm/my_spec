import { readFile, writeFile, mkdir, chmod } from 'fs/promises';
import { join } from 'path';
import type {
  AppConfig,
  SavedConnection,
  BrowserSettings,
  ConfigManagerOptions,
} from '../types';
import { ConfigError, ValidationError } from '../errors';
import { generateId, getDefaultConfigDir, fileExists } from '../utils';
import { DEFAULT_CONFIG, validateConnection, validateConfig } from './schema';
import { SecureStorage, isEncryptedValue } from './storage';

const CONFIG_FILE = 'config.json';
const SALT_FILE = '.salt';

export class ConfigManager {
  private config: AppConfig;
  private configPath: string;
  private saltPath: string;
  private secureStorage?: SecureStorage;
  private loaded = false;

  constructor(private options: ConfigManagerOptions = {}) {
    const configDir = options.configDir || getDefaultConfigDir();
    this.configPath = join(configDir, CONFIG_FILE);
    this.saltPath = join(configDir, SALT_FILE);
    this.config = { ...DEFAULT_CONFIG };
  }

  async load(): Promise<AppConfig> {
    try {
      // Ensure config directory exists
      const configDir = join(this.configPath, '..');
      await mkdir(configDir, { recursive: true });
      await chmod(configDir, 0o700);

      // Initialize secure storage if encryption key provided
      if (this.options.encryptionKey) {
        await this.initSecureStorage();
      }

      // Load config file if exists
      if (await fileExists(this.configPath)) {
        const content = await readFile(this.configPath, 'utf-8');
        const rawConfig = JSON.parse(content);

        // Decrypt passwords if secure storage is initialized
        if (this.secureStorage) {
          this.decryptPasswords(rawConfig);
        }

        this.config = validateConfig(rawConfig);
      }

      this.loaded = true;
      return this.config;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigError('Invalid config file format (JSON parse error)');
      }
      throw new ConfigError(
        `Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async save(): Promise<void> {
    try {
      const configDir = join(this.configPath, '..');
      await mkdir(configDir, { recursive: true });

      // Create a copy for saving
      const saveConfig = JSON.parse(JSON.stringify(this.config));

      // Encrypt passwords if secure storage is initialized
      if (this.secureStorage) {
        this.encryptPasswords(saveConfig);
      }

      await writeFile(this.configPath, JSON.stringify(saveConfig, null, 2), 'utf-8');
      await chmod(this.configPath, 0o600);
    } catch (error) {
      throw new ConfigError(
        `Failed to save config: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // Connection management
  async addConnection(
    connection: Omit<SavedConnection, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    validateConnection(connection as Partial<SavedConnection>);

    const now = Date.now();
    const newConnection: SavedConnection = {
      ...connection,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };

    this.config.connections.push(newConnection);
    await this.save();

    return newConnection.id;
  }

  async updateConnection(id: string, updates: Partial<SavedConnection>): Promise<void> {
    const index = this.config.connections.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new ValidationError(`Connection not found: ${id}`, 'id');
    }

    const updated = {
      ...this.config.connections[index],
      ...updates,
      id, // Prevent ID from being changed
      createdAt: this.config.connections[index].createdAt, // Preserve creation time
      updatedAt: Date.now(),
    };

    validateConnection(updated);
    this.config.connections[index] = updated;
    await this.save();
  }

  async removeConnection(id: string): Promise<boolean> {
    const index = this.config.connections.findIndex((c) => c.id === id);
    if (index === -1) {
      return false;
    }

    this.config.connections.splice(index, 1);

    // Clear lastConnectionId if it was the removed connection
    if (this.config.lastConnectionId === id) {
      this.config.lastConnectionId = undefined;
    }

    await this.save();
    return true;
  }

  getConnection(id: string): SavedConnection | undefined {
    return this.config.connections.find((c) => c.id === id);
  }

  getConnectionByName(name: string): SavedConnection | undefined {
    return this.config.connections.find((c) => c.name === name);
  }

  getAllConnections(): SavedConnection[] {
    return [...this.config.connections];
  }

  // Browser settings
  getBrowserSettings(): BrowserSettings {
    return { ...this.config.browserSettings };
  }

  async updateBrowserSettings(settings: Partial<BrowserSettings>): Promise<void> {
    this.config.browserSettings = {
      ...this.config.browserSettings,
      ...settings,
    };
    await this.save();
  }

  // Port forward defaults
  getPortForwardDefaults(): { localPort: number; remotePort: number } {
    return { ...this.config.portForwardDefaults };
  }

  async updatePortForwardDefaults(defaults: { localPort?: number; remotePort?: number }): Promise<void> {
    this.config.portForwardDefaults = {
      ...this.config.portForwardDefaults,
      ...defaults,
    };
    await this.save();
  }

  // Last connection
  getLastConnectionId(): string | undefined {
    return this.config.lastConnectionId;
  }

  async setLastConnectionId(id: string): Promise<void> {
    if (!this.config.connections.find((c) => c.id === id)) {
      throw new ValidationError(`Connection not found: ${id}`, 'id');
    }
    this.config.lastConnectionId = id;
    await this.save();
  }

  // Export/Import
  async export(path: string): Promise<void> {
    const exportConfig = { ...this.config };

    // Remove sensitive data for export
    exportConfig.connections = exportConfig.connections.map((conn) => ({
      ...conn,
      password: undefined,
    }));

    await writeFile(path, JSON.stringify(exportConfig, null, 2), 'utf-8');
  }

  async import(path: string): Promise<void> {
    if (!(await fileExists(path))) {
      throw new ConfigError(`Import file not found: ${path}`);
    }

    const content = await readFile(path, 'utf-8');
    const importConfig = JSON.parse(content);

    // Validate imported config
    const validated = validateConfig(importConfig);

    // Merge connections (don't overwrite existing)
    for (const conn of validated.connections) {
      const exists = this.config.connections.find(
        (c) => c.name === conn.name && c.host === conn.host
      );
      if (!exists) {
        this.config.connections.push(conn);
      }
    }

    // Update settings
    this.config.browserSettings = validated.browserSettings;
    this.config.portForwardDefaults = validated.portForwardDefaults;

    await this.save();
  }

  // Full config access
  getConfig(): AppConfig {
    return { ...this.config };
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private async initSecureStorage(): Promise<void> {
    this.secureStorage = new SecureStorage();

    let existingSalt: Buffer | undefined;
    if (await fileExists(this.saltPath)) {
      existingSalt = await readFile(this.saltPath);
    }

    await this.secureStorage.init(this.options.encryptionKey!, existingSalt);

    // Save salt if it's new
    if (!existingSalt && this.secureStorage.getSalt()) {
      await writeFile(this.saltPath, this.secureStorage.getSalt()!);
      await chmod(this.saltPath, 0o600);
    }
  }

  private encryptPasswords(config: AppConfig): void {
    if (!this.secureStorage) return;

    for (const conn of config.connections) {
      if (conn.password && !isEncryptedValue(conn.password)) {
        conn.password = this.secureStorage.encrypt(conn.password);
      }
    }
  }

  private decryptPasswords(config: AppConfig): void {
    if (!this.secureStorage) return;

    for (const conn of config.connections) {
      if (conn.password && isEncryptedValue(conn.password)) {
        try {
          conn.password = this.secureStorage.decrypt(conn.password);
        } catch {
          // If decryption fails, clear the password
          conn.password = undefined;
        }
      }
    }
  }
}
