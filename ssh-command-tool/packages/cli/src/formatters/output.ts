import chalk from 'chalk';

export type OutputFormat = 'table' | 'json' | 'raw';

export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return chalk.gray('No data');
  }

  // Calculate column widths
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length))
  );

  // Format header
  const headerLine = headers
    .map((h, i) => chalk.bold(h.padEnd(colWidths[i])))
    .join('  ');
  const separator = colWidths.map((w) => '-'.repeat(w)).join('  ');

  // Format rows
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join('  ')
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

export function formatJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatSuccess(message: string): string {
  return chalk.green('✓ ') + message;
}

export function formatError(message: string): string {
  return chalk.red('✗ ') + message;
}

export function formatWarning(message: string): string {
  return chalk.yellow('⚠ ') + message;
}

export function formatInfo(message: string): string {
  return chalk.blue('ℹ ') + message;
}

export function formatStatus(status: string, isActive: boolean): string {
  return isActive ? chalk.green(status) : chalk.gray(status);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function formatConnectionState(state: string): string {
  switch (state) {
    case 'connected':
      return chalk.green('● Connected');
    case 'connecting':
      return chalk.yellow('◐ Connecting');
    case 'disconnected':
      return chalk.gray('○ Disconnected');
    case 'error':
      return chalk.red('✗ Error');
    case 'reconnecting':
      return chalk.yellow('↻ Reconnecting');
    default:
      return state;
  }
}

export function formatSessionState(state: {
  ssh: string;
  portForward: string;
  browser: string;
  cdp: string;
}): string {
  const lines = [
    `SSH:          ${formatConnectionState(state.ssh)}`,
    `Port Forward: ${state.portForward === 'active' ? chalk.green('● Active') : chalk.gray('○ Inactive')}`,
    `Browser:      ${state.browser === 'running' ? chalk.green('● Running') : chalk.gray('○ Stopped')}`,
    `CDP:          ${formatConnectionState(state.cdp)}`,
  ];
  return lines.join('\n');
}

export function spinner(message: string): {
  update: (msg: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  stop: () => void;
} {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let running = true;

  const interval = setInterval(() => {
    if (running) {
      process.stdout.write(`\r${chalk.cyan(frames[frameIndex])} ${message}`);
      frameIndex = (frameIndex + 1) % frames.length;
    }
  }, 80);

  return {
    update: (msg: string) => {
      message = msg;
    },
    success: (msg: string) => {
      running = false;
      clearInterval(interval);
      process.stdout.write(`\r${formatSuccess(msg)}\n`);
    },
    error: (msg: string) => {
      running = false;
      clearInterval(interval);
      process.stdout.write(`\r${formatError(msg)}\n`);
    },
    stop: () => {
      running = false;
      clearInterval(interval);
      process.stdout.write('\r');
    },
  };
}

export function printBox(title: string, content: string): void {
  const lines = content.split('\n');
  const maxWidth = Math.max(title.length + 4, ...lines.map((l) => l.length + 4));

  console.log(chalk.gray('┌' + '─'.repeat(maxWidth) + '┐'));
  console.log(chalk.gray('│ ') + chalk.bold(title.padEnd(maxWidth - 2)) + chalk.gray(' │'));
  console.log(chalk.gray('├' + '─'.repeat(maxWidth) + '┤'));
  for (const line of lines) {
    console.log(chalk.gray('│ ') + line.padEnd(maxWidth - 2) + chalk.gray(' │'));
  }
  console.log(chalk.gray('└' + '─'.repeat(maxWidth) + '┘'));
}
