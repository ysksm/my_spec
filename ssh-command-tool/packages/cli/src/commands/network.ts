import { Command } from 'commander';
import { writeFile } from 'fs/promises';
import { getSession } from './session';
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatTable,
  formatBytes,
  formatDuration,
} from '../formatters/output';

export const networkCommand = new Command('network')
  .description('Network monitoring commands');

networkCommand
  .command('start')
  .description('Start recording network requests')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      if (session.network.isRecording()) {
        console.log(formatInfo('Network recording is already active'));
        return;
      }

      await session.network.start();
      console.log(formatSuccess('Network recording started'));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

networkCommand
  .command('stop')
  .description('Stop recording network requests')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      if (!session.network.isRecording()) {
        console.log(formatInfo('Network recording is not active'));
        return;
      }

      await session.network.stop();
      const entries = session.network.getEntries();
      console.log(formatSuccess(`Network recording stopped. ${entries.length} requests captured.`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

networkCommand
  .command('show')
  .description('Show recorded network requests')
  .option('-l, --limit <n>', 'Limit number of entries to show', '50')
  .option('-t, --type <type>', 'Filter by resource type (XHR, Fetch, Script, etc.)')
  .option('-s, --status <code>', 'Filter by status code')
  .action(async (options) => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      let entries = session.network.getEntries();

      // Apply filters
      if (options.type) {
        entries = entries.filter((e) =>
          e.request.resourceType.toLowerCase().includes(options.type.toLowerCase())
        );
      }

      if (options.status) {
        const statusCode = parseInt(options.status, 10);
        entries = entries.filter((e) => e.response?.status === statusCode);
      }

      // Apply limit
      const limit = parseInt(options.limit, 10);
      entries = entries.slice(0, limit);

      if (entries.length === 0) {
        console.log(formatInfo('No network requests recorded'));
        return;
      }

      const headers = ['Method', 'Status', 'Type', 'Size', 'Time', 'URL'];
      const rows = entries.map((e) => [
        e.request.method,
        e.response?.status?.toString() || '-',
        e.request.resourceType.slice(0, 10),
        e.response?.contentLength ? formatBytes(e.response.contentLength) : '-',
        e.duration ? formatDuration(e.duration) : '-',
        e.request.url.length > 50 ? e.request.url.slice(0, 50) + '...' : e.request.url,
      ]);

      console.log(formatTable(headers, rows));
      console.log(`\nShowing ${entries.length} of ${session.network.getEntries().length} entries`);
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

networkCommand
  .command('export <file>')
  .description('Export recorded network requests')
  .option('-f, --format <format>', 'Export format (har|json)', 'har')
  .action(async (file, options) => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      const entries = session.network.getEntries();
      if (entries.length === 0) {
        console.log(formatInfo('No network requests to export'));
        return;
      }

      let content: string;
      if (options.format === 'har') {
        const har = session.network.exportHAR();
        content = JSON.stringify(har, null, 2);
      } else {
        content = session.network.exportJSON();
      }

      await writeFile(file, content, 'utf-8');
      console.log(formatSuccess(`Exported ${entries.length} requests to: ${file}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

networkCommand
  .command('clear')
  .description('Clear recorded network requests')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      session.network.clear();
      console.log(formatSuccess('Network recording cleared'));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
