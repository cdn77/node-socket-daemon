#!/usr/bin/env node

import * as program from 'commander';
import { loadConfig, Options } from './config';
import { main } from './commands/main';
import { sendAction } from './commands/client';

const pkg = require('../package.json');
process.umask(0o117);

function append(value: string, list: string[]): string[] {
  list.push(...value.split(/,/g));
  return list;
}

async function run(command: Command, ...args: any[]): Promise<void> {
  try {
    const options = await loadConfig(program);
    await command(options, ...args);
  } catch (e) {
    console.error(`Error: ${e.message || e}\n`);
    program.outputHelp();
    process.exit(1);
  }
}

type Command = {
  (options: Options, ...args: any[]): Promise<void>;
};

program
  .version(pkg.version, '-v, --version')
  .option('-c, --config <path>', 'Config file path')
  .option('-s, --script <file>', 'Main script path')
  .option('-l, --listen-var <name>', 'Listen env var name')
  .option('-t, --tmp-dir <dir>', 'Temp directory path')
  .option('-o, --socket-file <file>', 'Socket file name')
  .option('-i, --ipc-file <file>', 'IPC file name')
  .option('-w, --workers <workers>', 'Workers', parseInt)
  .option('-e, --env <var>', 'Environment variable whitelist', append, []);

program
  .command('start')
  .description('Start workers')
  .action(async () => await run(sendAction, 'start'));

program
  .command('stop')
  .description('Stop workers')
  .action(async () => await run(sendAction, 'stop'));

program
  .command('restart')
  .description('Restart workers')
  .action(async () => await run(sendAction, 'restart'));

program
  .command('resume')
  .description('Resume suspended workers')
  .action(async () => await run(sendAction, 'send', 'resume'));

program
  .command('send <msg>')
  .description('Send custom message to workers')
  .action(async (msg: string) => await run(sendAction, 'send', msg));

program
  .command('daemon')
  .description('Run main daemon (default)')
  .action(async () => await run(main));

const args = process.argv;
args.some(arg => /^(start|stop|restart|send|daemon)$/.test(arg)) || args.push('daemon');
program.parse(args);
