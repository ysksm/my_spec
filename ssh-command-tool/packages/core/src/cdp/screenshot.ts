import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import type { PageController } from './page';
import type { ScreenshotOptions } from '../types';

export interface BatchScreenshotOptions extends ScreenshotOptions {
  outputDir: string;
  filenamePrefix?: string;
  delay?: number;
}

export interface ScreenshotResult {
  url: string;
  filename: string;
  path: string;
  success: boolean;
  error?: string;
}

export class ScreenshotHelper {
  constructor(private pageController: PageController) {}

  async take(options?: ScreenshotOptions): Promise<Buffer> {
    return this.pageController.screenshot(options);
  }

  async takeAndSave(path: string, options?: ScreenshotOptions): Promise<void> {
    const buffer = await this.take(options);

    // Ensure directory exists
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });

    await writeFile(path, buffer);
  }

  async batch(
    urls: string[],
    options: BatchScreenshotOptions
  ): Promise<ScreenshotResult[]> {
    const results: ScreenshotResult[] = [];
    const { outputDir, filenamePrefix = 'screenshot', delay = 1000, ...screenshotOptions } = options;

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const filename = `${filenamePrefix}_${i + 1}_${this.sanitizeFilename(url)}.${screenshotOptions.format || 'png'}`;
      const path = `${outputDir}/${filename}`;

      try {
        await this.pageController.navigate(url, { waitUntil: 'load' });

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const buffer = await this.take(screenshotOptions);
        await writeFile(path, buffer);

        results.push({
          url,
          filename,
          path,
          success: true,
        });
      } catch (error) {
        results.push({
          url,
          filename,
          path,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private sanitizeFilename(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
    } catch {
      return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
    }
  }
}
