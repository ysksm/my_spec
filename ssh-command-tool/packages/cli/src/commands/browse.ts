import { Command } from 'commander';
import { getSession } from './session';
import { formatSuccess, formatError, formatInfo, spinner } from '../formatters/output';

export const browseCommand = new Command('browse')
  .description('Browser navigation commands');

browseCommand
  .command('goto <url>')
  .description('Navigate to a URL')
  .option('-w, --wait <event>', 'Wait until (load|domcontentloaded|networkidle)', 'load')
  .option('-t, --timeout <ms>', 'Navigation timeout in milliseconds', '30000')
  .action(async (url, options) => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const spin = spinner(`Navigating to ${url}...`);

      await session.page.navigate(url, {
        waitUntil: options.wait as 'load' | 'domcontentloaded' | 'networkidle',
        timeout: parseInt(options.timeout, 10),
      });

      const title = await session.page.getTitle();
      spin.success(`Navigated to: ${title}`);
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

browseCommand
  .command('back')
  .description('Go back in browser history')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      await session.page.goBack();
      const url = await session.page.getUrl();
      console.log(formatSuccess(`Navigated back to: ${url}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

browseCommand
  .command('forward')
  .description('Go forward in browser history')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      await session.page.goForward();
      const url = await session.page.getUrl();
      console.log(formatSuccess(`Navigated forward to: ${url}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

browseCommand
  .command('reload')
  .description('Reload the current page')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      const spin = spinner('Reloading page...');
      await session.page.reload();
      spin.success('Page reloaded');
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

browseCommand
  .command('info')
  .description('Show current page information')
  .action(async () => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      const [url, title] = await Promise.all([
        session.page.getUrl(),
        session.page.getTitle(),
      ]);

      console.log(`
Title: ${title}
URL:   ${url}
      `.trim());
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

browseCommand
  .command('eval <expression>')
  .description('Evaluate JavaScript in the page')
  .action(async (expression) => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      const result = await session.page.evaluate(expression);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
