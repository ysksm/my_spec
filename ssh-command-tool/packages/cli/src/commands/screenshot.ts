import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { getSession } from './session';
import { formatSuccess, formatError, spinner, formatTable } from '../formatters/output';

export const screenshotCommand = new Command('screenshot')
  .description('Screenshot commands');

screenshotCommand
  .command('take [output]')
  .description('Take a screenshot of the current page')
  .option('-f, --format <format>', 'Image format (png|jpeg|webp)', 'png')
  .option('-q, --quality <quality>', 'Image quality for jpeg/webp (0-100)', '80')
  .option('--full-page', 'Capture the full scrollable page')
  .action(async (output, options) => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      const outputPath = output || `screenshot_${Date.now()}.${options.format}`;
      const spin = spinner('Taking screenshot...');

      await session.screenshot.takeAndSave(outputPath, {
        format: options.format as 'png' | 'jpeg' | 'webp',
        quality: parseInt(options.quality, 10),
        fullPage: options.fullPage,
      });

      spin.success(`Screenshot saved to: ${outputPath}`);
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

screenshotCommand
  .command('batch <url-file>')
  .description('Take screenshots of multiple URLs')
  .option('-o, --output-dir <dir>', 'Output directory', './screenshots')
  .option('-p, --prefix <prefix>', 'Filename prefix', 'screenshot')
  .option('-f, --format <format>', 'Image format (png|jpeg|webp)', 'png')
  .option('-d, --delay <ms>', 'Delay after page load in milliseconds', '1000')
  .action(async (urlFile, options) => {
    try {
      const session = getSession();
      if (!session?.isReady()) {
        console.error(formatError('No active session. Start one with "session start"'));
        process.exit(1);
      }

      // Read URL file
      const content = await readFile(urlFile, 'utf-8');
      const urls = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      if (urls.length === 0) {
        console.error(formatError('No URLs found in file'));
        process.exit(1);
      }

      console.log(`Processing ${urls.length} URLs...\n`);

      const results = await session.screenshot.batch(urls, {
        outputDir: options.outputDir,
        filenamePrefix: options.prefix,
        format: options.format as 'png' | 'jpeg' | 'webp',
        delay: parseInt(options.delay, 10),
      });

      // Show results
      const headers = ['URL', 'Status', 'File'];
      const rows = results.map((r) => [
        r.url.length > 40 ? r.url.slice(0, 40) + '...' : r.url,
        r.success ? 'OK' : 'FAILED',
        r.success ? r.filename : r.error || 'Unknown error',
      ]);

      console.log(formatTable(headers, rows));

      const successful = results.filter((r) => r.success).length;
      console.log(`\n${formatSuccess(`Completed: ${successful}/${results.length} screenshots`)}`);
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
