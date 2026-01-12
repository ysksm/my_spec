import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigManager, SessionManager, type SessionOptions } from '@ssh-tool/core';
import { getSession, setSession } from '../commands/session';
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatSessionState,
  spinner,
  printBox,
} from '../formatters/output';

export const interactiveCommand = new Command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.bold('\n  SSH Command Tool 3 - Interactive Mode\n'));

    while (true) {
      const session = getSession();
      const hasSession = session?.isReady();

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🔗 Manage Connections', value: 'connections' },
            {
              name: hasSession ? '🛑 Stop Session' : '🚀 Start Session',
              value: hasSession ? 'stop-session' : 'start-session',
            },
            ...(hasSession
              ? [
                  { name: '🌐 Navigate to URL', value: 'navigate' },
                  { name: '📸 Take Screenshot', value: 'screenshot' },
                  { name: '📊 Network Recording', value: 'network' },
                  { name: '📋 Session Status', value: 'status' },
                ]
              : []),
            new inquirer.Separator(),
            { name: '❌ Exit', value: 'exit' },
          ],
        },
      ]);

      switch (action) {
        case 'connections':
          await handleConnections();
          break;
        case 'start-session':
          await handleStartSession();
          break;
        case 'stop-session':
          await handleStopSession();
          break;
        case 'navigate':
          await handleNavigate();
          break;
        case 'screenshot':
          await handleScreenshot();
          break;
        case 'network':
          await handleNetwork();
          break;
        case 'status':
          await handleStatus();
          break;
        case 'exit':
          if (getSession()?.isReady()) {
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: 'Stop active session before exiting?',
                default: true,
              },
            ]);
            if (confirm) {
              await handleStopSession();
            }
          }
          console.log(chalk.gray('\nGoodbye!\n'));
          process.exit(0);
      }

      console.log();
    }
  });

async function handleConnections(): Promise<void> {
  const configManager = new ConfigManager();
  await configManager.load();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Connection Management',
      choices: [
        { name: 'List connections', value: 'list' },
        { name: 'Add connection', value: 'add' },
        { name: 'Test connection', value: 'test' },
        { name: 'Remove connection', value: 'remove' },
        { name: 'Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return;

  if (action === 'list') {
    const connections = configManager.getAllConnections();
    if (connections.length === 0) {
      console.log(formatInfo('\nNo connections saved\n'));
    } else {
      console.log('\nSaved Connections:');
      connections.forEach((c) => {
        console.log(`  • ${chalk.bold(c.name)} - ${c.username}@${c.host}:${c.port}`);
      });
      console.log();
    }
  }

  if (action === 'add') {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Connection name:' },
      { type: 'input', name: 'host', message: 'SSH host:' },
      { type: 'input', name: 'port', message: 'SSH port:', default: '22' },
      { type: 'input', name: 'username', message: 'Username:', default: process.env.USER },
      {
        type: 'list',
        name: 'authType',
        message: 'Authentication:',
        choices: [
          { name: 'Private Key', value: 'privateKey' },
          { name: 'Password', value: 'password' },
        ],
      },
    ]);

    if (answers.authType === 'password') {
      const { password } = await inquirer.prompt([
        { type: 'password', name: 'password', message: 'Password:', mask: '*' },
      ]);
      answers.password = password;
    } else {
      const { privateKeyPath } = await inquirer.prompt([
        { type: 'input', name: 'privateKeyPath', message: 'Private key path:', default: '~/.ssh/id_rsa' },
      ]);
      answers.privateKeyPath = privateKeyPath;
    }

    const id = await configManager.addConnection({
      name: answers.name,
      host: answers.host,
      port: parseInt(answers.port, 10),
      username: answers.username,
      authType: answers.authType,
      password: answers.password,
      privateKeyPath: answers.privateKeyPath,
    });

    console.log(formatSuccess(`\nConnection added: ${id}\n`));
  }

  if (action === 'test' || action === 'remove') {
    const connections = configManager.getAllConnections();
    if (connections.length === 0) {
      console.log(formatInfo('\nNo connections to test/remove\n'));
      return;
    }

    const { connectionId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'connectionId',
        message: 'Select connection:',
        choices: connections.map((c) => ({
          name: `${c.name} (${c.username}@${c.host})`,
          value: c.id,
        })),
      },
    ]);

    if (action === 'test') {
      const conn = configManager.getConnection(connectionId)!;
      const spin = spinner(`Testing connection to ${conn.host}...`);

      try {
        const { SSHClient } = await import('@ssh-tool/core');
        const client = new SSHClient({
          host: conn.host,
          port: conn.port,
          username: conn.username,
          authType: conn.authType,
          password: conn.password,
          privateKey: conn.privateKeyPath,
        });

        await client.connect();
        await client.disconnect();
        spin.success('Connection successful');
      } catch (err) {
        spin.error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (action === 'remove') {
      const { confirm } = await inquirer.prompt([
        { type: 'confirm', name: 'confirm', message: 'Are you sure?', default: false },
      ]);

      if (confirm) {
        await configManager.removeConnection(connectionId);
        console.log(formatSuccess('\nConnection removed\n'));
      }
    }
  }
}

async function handleStartSession(): Promise<void> {
  const configManager = new ConfigManager();
  await configManager.load();

  const connections = configManager.getAllConnections();
  if (connections.length === 0) {
    console.log(formatError('\nNo connections saved. Add one first.\n'));
    return;
  }

  const { connectionId, headless } = await inquirer.prompt([
    {
      type: 'list',
      name: 'connectionId',
      message: 'Select connection:',
      choices: connections.map((c) => ({
        name: `${c.name} (${c.username}@${c.host})`,
        value: c.id,
      })),
    },
    {
      type: 'confirm',
      name: 'headless',
      message: 'Run browser in headless mode?',
      default: true,
    },
  ]);

  const conn = configManager.getConnection(connectionId)!;
  const spin = spinner('Starting session...');

  try {
    const sessionOptions: SessionOptions = {
      connection: {
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType,
        password: conn.password,
        privateKey: conn.privateKeyPath,
      },
      browser: { headless },
      portForward: { localPort: 9222, remotePort: 9222 },
    };

    const session = new SessionManager(sessionOptions);
    await session.start();
    setSession(session);

    spin.success('Session started');
    console.log();
    printBox('Session Status', formatSessionState(session.getState()));
  } catch (err) {
    spin.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleStopSession(): Promise<void> {
  const session = getSession();
  if (!session) return;

  const spin = spinner('Stopping session...');
  try {
    await session.stop();
    setSession(null);
    spin.success('Session stopped');
  } catch (err) {
    spin.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleNavigate(): Promise<void> {
  const session = getSession();
  if (!session?.isReady()) return;

  const { url } = await inquirer.prompt([
    { type: 'input', name: 'url', message: 'Enter URL:' },
  ]);

  if (!url) return;

  const fullUrl = url.startsWith('http') ? url : `https://${url}`;
  const spin = spinner(`Navigating to ${fullUrl}...`);

  try {
    await session.page.navigate(fullUrl);
    const title = await session.page.getTitle();
    spin.success(`Loaded: ${title}`);
  } catch (err) {
    spin.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleScreenshot(): Promise<void> {
  const session = getSession();
  if (!session?.isReady()) return;

  const { filename, fullPage } = await inquirer.prompt([
    {
      type: 'input',
      name: 'filename',
      message: 'Output filename:',
      default: `screenshot_${Date.now()}.png`,
    },
    { type: 'confirm', name: 'fullPage', message: 'Capture full page?', default: false },
  ]);

  const spin = spinner('Taking screenshot...');

  try {
    await session.screenshot.takeAndSave(filename, { fullPage });
    spin.success(`Saved to: ${filename}`);
  } catch (err) {
    spin.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleNetwork(): Promise<void> {
  const session = getSession();
  if (!session?.isReady()) return;

  const isRecording = session.network.isRecording();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `Network Recording (${isRecording ? 'Active' : 'Inactive'})`,
      choices: [
        { name: isRecording ? 'Stop Recording' : 'Start Recording', value: 'toggle' },
        { name: 'Show Requests', value: 'show' },
        { name: 'Export to HAR', value: 'export' },
        { name: 'Clear', value: 'clear' },
        { name: 'Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return;

  if (action === 'toggle') {
    if (isRecording) {
      await session.network.stop();
      console.log(formatSuccess('\nRecording stopped\n'));
    } else {
      await session.network.start();
      console.log(formatSuccess('\nRecording started\n'));
    }
  }

  if (action === 'show') {
    const entries = session.network.getEntries();
    if (entries.length === 0) {
      console.log(formatInfo('\nNo requests recorded\n'));
    } else {
      console.log(`\nRecorded ${entries.length} requests:`);
      entries.slice(0, 20).forEach((e) => {
        const status = e.response?.status || '-';
        console.log(`  ${e.request.method.padEnd(6)} ${status} ${e.request.url.slice(0, 60)}`);
      });
      if (entries.length > 20) {
        console.log(`  ... and ${entries.length - 20} more`);
      }
      console.log();
    }
  }

  if (action === 'export') {
    const { filename } = await inquirer.prompt([
      { type: 'input', name: 'filename', message: 'Output filename:', default: 'network.har' },
    ]);

    const { writeFile } = await import('fs/promises');
    const har = session.network.exportHAR();
    await writeFile(filename, JSON.stringify(har, null, 2));
    console.log(formatSuccess(`\nExported to: ${filename}\n`));
  }

  if (action === 'clear') {
    session.network.clear();
    console.log(formatSuccess('\nCleared\n'));
  }
}

async function handleStatus(): Promise<void> {
  const session = getSession();
  if (!session) return;

  console.log();
  printBox('Session Status', formatSessionState(session.getState()));
}
