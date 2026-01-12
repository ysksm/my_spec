import { Command } from 'commander';
import { ConfigManager } from '@ssh-tool/core';
import { formatSuccess, formatError, formatInfo } from '../formatters/output';

export const configCommand = new Command('config')
  .description('Configuration management');

configCommand
  .command('show')
  .description('Show current configuration')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      const config = configManager.getConfig();

      if (options.format === 'json') {
        // Remove sensitive data
        const safeConfig = {
          ...config,
          connections: config.connections.map((c) => ({
            ...c,
            password: c.password ? '********' : undefined,
          })),
        };
        console.log(JSON.stringify(safeConfig, null, 2));
      } else {
        const browserSettings = config.browserSettings;
        const portDefaults = config.portForwardDefaults;

        console.log(`
Configuration:
  Version: ${config.version}

Browser Settings:
  Default Headless: ${browserSettings.defaultHeadless}
  Default Port: ${browserSettings.defaultPort}
  User Data Dir: ${browserSettings.defaultUserDataDir}
  Executable Path: ${browserSettings.executablePath || '(auto-detect)'}

Port Forward Defaults:
  Local Port: ${portDefaults.localPort}
  Remote Port: ${portDefaults.remotePort}

Connections: ${config.connections.length} saved
Last Used: ${config.lastConnectionId || '(none)'}
        `.trim());
      }
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Update a configuration value')
  .action(async (key, value) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      const [category, setting] = key.split('.');

      switch (category) {
        case 'browser':
          const browserSettings = configManager.getBrowserSettings();
          switch (setting) {
            case 'headless':
              await configManager.updateBrowserSettings({
                defaultHeadless: value === 'true',
              });
              break;
            case 'port':
              await configManager.updateBrowserSettings({
                defaultPort: parseInt(value, 10),
              });
              break;
            case 'userDataDir':
              await configManager.updateBrowserSettings({
                defaultUserDataDir: value,
              });
              break;
            case 'executablePath':
              await configManager.updateBrowserSettings({
                executablePath: value,
              });
              break;
            default:
              console.error(formatError(`Unknown browser setting: ${setting}`));
              console.log(formatInfo('Available: headless, port, userDataDir, executablePath'));
              process.exit(1);
          }
          break;

        case 'portForward':
          switch (setting) {
            case 'localPort':
              await configManager.updatePortForwardDefaults({
                localPort: parseInt(value, 10),
              });
              break;
            case 'remotePort':
              await configManager.updatePortForwardDefaults({
                remotePort: parseInt(value, 10),
              });
              break;
            default:
              console.error(formatError(`Unknown portForward setting: ${setting}`));
              console.log(formatInfo('Available: localPort, remotePort'));
              process.exit(1);
          }
          break;

        default:
          console.error(formatError(`Unknown category: ${category}`));
          console.log(formatInfo('Available categories: browser, portForward'));
          process.exit(1);
      }

      console.log(formatSuccess(`Updated ${key} to ${value}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options) => {
    try {
      if (!options.yes) {
        console.log(formatInfo('This will reset all settings to defaults (connections will be preserved).'));
        console.log('Use --yes to confirm.');
        return;
      }

      const configManager = new ConfigManager();
      await configManager.load();

      // Reset browser settings
      await configManager.updateBrowserSettings({
        defaultHeadless: true,
        defaultPort: 9222,
        defaultUserDataDir: '/tmp/chrome-remote-debug',
        executablePath: undefined,
      });

      // Reset port forward defaults
      await configManager.updatePortForwardDefaults({
        localPort: 9222,
        remotePort: 9222,
      });

      console.log(formatSuccess('Configuration reset to defaults'));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

configCommand
  .command('export <file>')
  .description('Export configuration to a file')
  .action(async (file) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      await configManager.export(file);
      console.log(formatSuccess(`Configuration exported to: ${file}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

configCommand
  .command('import <file>')
  .description('Import configuration from a file')
  .action(async (file) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      await configManager.import(file);
      console.log(formatSuccess(`Configuration imported from: ${file}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
