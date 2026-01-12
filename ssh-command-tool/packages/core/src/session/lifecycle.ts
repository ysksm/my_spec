import type { SessionManager } from './manager';
import type { SessionState } from '../types';
import { SessionError } from '../errors';
import { sleep } from '../utils';

export interface LifecycleHooks {
  onBeforeStart?: () => Promise<void>;
  onAfterStart?: () => Promise<void>;
  onBeforeStop?: () => Promise<void>;
  onAfterStop?: () => Promise<void>;
  onStateChange?: (state: SessionState) => void;
  onError?: (error: Error) => void;
}

export class SessionLifecycle {
  private hooks: LifecycleHooks = {};
  private restartAttempts = 0;
  private maxRestartAttempts = 3;
  private restartDelay = 5000;

  constructor(
    private session: SessionManager,
    hooks?: LifecycleHooks
  ) {
    if (hooks) {
      this.hooks = hooks;
    }
    this.setupListeners();
  }

  private setupListeners(): void {
    this.session.on('state:change', (state) => {
      this.hooks.onStateChange?.(state);
    });

    this.session.on('error', (error) => {
      this.hooks.onError?.(error);
    });

    this.session.on('closed', () => {
      // Session closed unexpectedly
      if (this.restartAttempts < this.maxRestartAttempts) {
        this.handleUnexpectedClose();
      }
    });
  }

  async start(): Promise<void> {
    try {
      await this.hooks.onBeforeStart?.();
      await this.session.start();
      this.restartAttempts = 0;
      await this.hooks.onAfterStart?.();
    } catch (error) {
      throw new SessionError(
        `Lifecycle start failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async stop(): Promise<void> {
    try {
      await this.hooks.onBeforeStop?.();
      await this.session.stop();
      await this.hooks.onAfterStop?.();
    } catch (error) {
      throw new SessionError(
        `Lifecycle stop failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await sleep(1000);
    await this.start();
  }

  private async handleUnexpectedClose(): Promise<void> {
    this.restartAttempts++;
    console.warn(`Session closed unexpectedly. Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts}`);

    await sleep(this.restartDelay);

    try {
      await this.start();
    } catch (error) {
      if (this.restartAttempts >= this.maxRestartAttempts) {
        this.hooks.onError?.(
          new SessionError(`Max restart attempts (${this.maxRestartAttempts}) reached`)
        );
      }
    }
  }

  setMaxRestartAttempts(attempts: number): void {
    this.maxRestartAttempts = attempts;
  }

  setRestartDelay(delay: number): void {
    this.restartDelay = delay;
  }

  getRestartAttempts(): number {
    return this.restartAttempts;
  }
}
