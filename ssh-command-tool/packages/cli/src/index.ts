#!/usr/bin/env bun
import { Command } from 'commander';
import { connectCommand } from './commands/connect';
import { sessionCommand } from './commands/session';
import { browseCommand } from './commands/browse';
import { screenshotCommand } from './commands/screenshot';
import { networkCommand } from './commands/network';
import { configCommand } from './commands/config';
import { interactiveCommand } from './interactive/menu';

const program = new Command();

program
  .name('ssh-tool3')
  .description('SSH-based remote browser debugging and automation tool')
  .version('1.0.0');

// Register commands
program.addCommand(connectCommand);
program.addCommand(sessionCommand);
program.addCommand(browseCommand);
program.addCommand(screenshotCommand);
program.addCommand(networkCommand);
program.addCommand(configCommand);
program.addCommand(interactiveCommand);

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);
