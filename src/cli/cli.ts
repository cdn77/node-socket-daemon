#!/usr/bin/env node

import * as yargs from 'yargs';
import { ZodError } from 'zod';
import * as commands from './commands';

yargs
  .usage('Usage: $0 <command> [options]')
  .command(commands.daemon)
  .command(commands.getStatus)
  .command(commands.start)
  .command(commands.restart)
  .command(commands.resume)
  .command(commands.stop)
  .command(commands.setWorkerCount)
  .command(commands.setStandbyCount)
  .command(commands.sendAppMessage)
  .command(commands.sendAppRequest)
  .command(commands.reloadDaemonConfig)
  .command(commands.upgradeDaemon)
  .command(commands.terminateDaemon)
  .demandCommand()
  .fail((msg, err) => {
    if (err instanceof ZodError) {
      console.log(`Invalid config:\n - ${err.errors.map((e) => e.message).join('\n - ')}`);
    } else {
      console.log(`Unhandled application error:`);
      console.log(err);
    }

    console.log('');
    process.exit(1);
  })
  .strict()
  .help()
  .parse();
