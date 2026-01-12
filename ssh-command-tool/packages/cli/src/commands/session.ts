import { Command } from 'commander';
import {
  ConfigManager,
  SessionManager,
  type SessionOptions,
} from '@ssh-tool/core';
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatSessionState,
  spinner,
  printBox,
} from '../formatters/output';

// Global session instance
let currentSession: SessionManager | null = null;

export function getSession(): SessionManager | null {
  return currentSession;
}

export function setSession(session: SessionManager | null): void {
  currentSession = session;
}

export const sessionCommand = new Command('session')
  .description('Manage browser sessions');

sessionCommand
  .command('start [connection-id]')
  .description('Start a new session')
  .option('-H, --headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser with GUI')
  .option('-l, --local-port <port>', 'Local port for forwarding', '9222')
  .option('-r, --remote-port <port>', 'Remote Chrome debugging port', '9222')
  .action(async (connectionId, options) => {
    try {
      if (currentSession?.isReady()) {
        console.error(formatError('A session is already running. Stop it first with "session stop"'));
        process.exit(1);
      }

      const configManager = new ConfigManager();
      await configManager.load();

      // Get connection
      let connection;
      if (connectionId) {
        const connections = configManager.getAllConnections();
        connection = connections.find(
          (c) => c.id === connectionId || c.id.startsWith(connectionId) || c.name === connectionId
        );
      } else {
        // Use last connection or prompt
        const lastId = configManager.getLastConnectionId();
        if (lastId) {
          connection = configManager.getConnection(lastId);
        }
      }

      if (!connection) {
        console.error(formatError('Connection not found. Use "connect list" to see available connections.'));
        process.exit(1);
      }

      const sessionOptions: SessionOptions = {
        connection: {
          host: connection.host,
          port: connection.port,
          username: connection.username,
          authType: connection.authType,
          password: connection.password,
          privateKey: connection.privateKeyPath,
        },
        browser: {
          headless: options.headless,
          debuggingPort: parseInt(options.remotePort, 10),
        },
        portForward: {
          localPort: parseInt(options.localPort, 10),
          remotePort: parseInt(options.remotePort, 10),
        },
      };

      const spin = spinner('Starting session...');

      currentSession = new SessionManager(sessionOptions);

      currentSession.on('state:change', (state) => {
        if (state.ssh === 'connecting') spin.update('Connecting via SSH...');
        if (state.browser === 'starting') spin.update('Starting browser...');
        if (state.portForward === 'active') spin.update('Setting up port forwarding...');
        if (state.cdp === 'connecting') spin.update('Connecting to Chrome DevTools...');
      });

      await currentSession.start();

      // Save as last used connection
      await configManager.setLastConnectionId(connection.id);

      spin.success('Session started successfully');

      console.log();
      printBox('Session Status', formatSessionState(currentSession.getState()));
      console.log();
      console.log(formatInfo(`Chrome DevTools available at: http://localhost:${options.localPort}`));
    } catch (error) {
      if (currentSession) {
        await currentSession.stop().catch(() => {});
        currentSession = null;
      }
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

sessionCommand
  .command('stop')
  .description('Stop the current session')
  .action(async () => {
    try {
      if (!currentSession) {
        console.log(formatInfo('No active session'));
        return;
      }

      const spin = spinner('Stopping session...');

      await currentSession.stop();
      currentSession = null;

      spin.success('Session stopped');
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

sessionCommand
  .command('status')
  .description('Show current session status')
  .action(async () => {
    try {
      if (!currentSession) {
        console.log(formatInfo('No active session'));
        return;
      }

      printBox('Session Status', formatSessionState(currentSession.getState()));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
