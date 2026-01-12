import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager, SSHClient, type SavedConnection } from '@ssh-tool/core';
import {
  formatTable,
  formatSuccess,
  formatError,
  formatInfo,
  spinner,
} from '../formatters/output';

export const connectCommand = new Command('connect')
  .description('Manage SSH connections');

connectCommand
  .command('add')
  .description('Add a new SSH connection')
  .option('-n, --name <name>', 'Connection name')
  .option('-H, --host <host>', 'SSH host')
  .option('-p, --port <port>', 'SSH port', '22')
  .option('-u, --username <username>', 'SSH username')
  .option('-a, --auth-type <type>', 'Authentication type (password|privateKey)')
  .option('-P, --password <password>', 'SSH password')
  .option('-k, --private-key <path>', 'Path to private key')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      // If options are not provided, prompt for them
      const answers = await promptConnectionDetails(options);

      const id = await configManager.addConnection({
        name: answers.name,
        host: answers.host,
        port: parseInt(answers.port, 10),
        username: answers.username,
        authType: answers.authType,
        password: answers.authType === 'password' ? answers.password : undefined,
        privateKeyPath: answers.authType === 'privateKey' ? answers.privateKey : undefined,
      });

      console.log(formatSuccess(`Connection added with ID: ${id}`));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

connectCommand
  .command('list')
  .description('List all saved connections')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      const connections = configManager.getAllConnections();

      if (options.format === 'json') {
        console.log(JSON.stringify(connections, null, 2));
      } else {
        if (connections.length === 0) {
          console.log(formatInfo('No connections saved. Use "ssh-tool3 connect add" to add one.'));
          return;
        }

        const headers = ['Name', 'Host', 'Port', 'Username', 'Auth Type', 'ID'];
        const rows = connections.map((c) => [
          c.name,
          c.host,
          String(c.port),
          c.username,
          c.authType,
          c.id.slice(0, 8) + '...',
        ]);

        console.log(formatTable(headers, rows));
      }
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

connectCommand
  .command('remove <id>')
  .description('Remove a saved connection')
  .action(async (id) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      // Allow matching by partial ID or name
      const connections = configManager.getAllConnections();
      const connection = connections.find(
        (c) => c.id === id || c.id.startsWith(id) || c.name === id
      );

      if (!connection) {
        console.error(formatError(`Connection not found: ${id}`));
        process.exit(1);
      }

      const removed = await configManager.removeConnection(connection.id);
      if (removed) {
        console.log(formatSuccess(`Connection "${connection.name}" removed`));
      } else {
        console.error(formatError('Failed to remove connection'));
        process.exit(1);
      }
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

connectCommand
  .command('test <id>')
  .description('Test an SSH connection')
  .action(async (id) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      // Allow matching by partial ID or name
      const connections = configManager.getAllConnections();
      const connection = connections.find(
        (c) => c.id === id || c.id.startsWith(id) || c.name === id
      );

      if (!connection) {
        console.error(formatError(`Connection not found: ${id}`));
        process.exit(1);
      }

      const spin = spinner(`Testing connection to ${connection.host}...`);

      const sshClient = new SSHClient({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        authType: connection.authType,
        password: connection.password,
        privateKey: connection.privateKeyPath,
      });

      try {
        await sshClient.connect();
        const result = await sshClient.exec('echo "Connection successful"');
        await sshClient.disconnect();

        if (result.exitCode === 0) {
          spin.success(`Connection to "${connection.name}" successful`);
        } else {
          spin.error(`Connection test failed: ${result.stderr}`);
          process.exit(1);
        }
      } catch (err) {
        spin.error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

connectCommand
  .command('show <id>')
  .description('Show connection details')
  .action(async (id) => {
    try {
      const configManager = new ConfigManager();
      await configManager.load();

      // Allow matching by partial ID or name
      const connections = configManager.getAllConnections();
      const connection = connections.find(
        (c) => c.id === id || c.id.startsWith(id) || c.name === id
      );

      if (!connection) {
        console.error(formatError(`Connection not found: ${id}`));
        process.exit(1);
      }

      console.log(`
Name:         ${connection.name}
Host:         ${connection.host}
Port:         ${connection.port}
Username:     ${connection.username}
Auth Type:    ${connection.authType}
${connection.privateKeyPath ? `Private Key:  ${connection.privateKeyPath}` : ''}
ID:           ${connection.id}
Created:      ${new Date(connection.createdAt).toLocaleString()}
Updated:      ${new Date(connection.updatedAt).toLocaleString()}
      `.trim());
    } catch (error) {
      console.error(formatError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

async function promptConnectionDetails(options: any): Promise<any> {
  const questions: any[] = [];

  if (!options.name) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Connection name:',
      validate: (input: string) => input.trim() !== '' || 'Name is required',
    });
  }

  if (!options.host) {
    questions.push({
      type: 'input',
      name: 'host',
      message: 'SSH host:',
      validate: (input: string) => input.trim() !== '' || 'Host is required',
    });
  }

  if (!options.port) {
    questions.push({
      type: 'input',
      name: 'port',
      message: 'SSH port:',
      default: '22',
    });
  }

  if (!options.username) {
    questions.push({
      type: 'input',
      name: 'username',
      message: 'Username:',
      default: process.env.USER,
    });
  }

  if (!options.authType) {
    questions.push({
      type: 'list',
      name: 'authType',
      message: 'Authentication type:',
      choices: [
        { name: 'Private Key', value: 'privateKey' },
        { name: 'Password', value: 'password' },
      ],
    });
  }

  const baseAnswers = await inquirer.prompt(questions);
  const combined = { ...options, ...baseAnswers };

  // Prompt for auth-specific fields
  if (combined.authType === 'password' && !combined.password) {
    const passwordAnswer = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
      },
    ]);
    combined.password = passwordAnswer.password;
  }

  if (combined.authType === 'privateKey' && !combined.privateKey) {
    const keyAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'privateKey',
        message: 'Private key path:',
        default: '~/.ssh/id_rsa',
      },
    ]);
    combined.privateKey = keyAnswer.privateKey;
  }

  return combined;
}
