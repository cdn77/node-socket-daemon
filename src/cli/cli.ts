#!/usr/bin/env node

import * as yargs from 'yargs';
import { ZodError } from 'zod';
import * as commands from './commands';
import { formatErrors } from './utils';

yargs
  .usage('Usage: $0 <command> [options]')
  .command(commands.daemon)
  .command(commands.getStatus)
  .command(commands.getConfig)
  .command(commands.start)
  .command(commands.restart)
  .command(commands.resume)
  .command(commands.stop)
  .command(commands.setWorkerCount)
  .command(commands.setStandbyCount)
  .command(commands.reloadDaemonConfig)
  .command(commands.terminateDaemon)
  .command(commands.sendAppMessage)
  .command(commands.sendAppRequest)
  .demandCommand()
  .fail((msg, err, yargs) => {
    if (err instanceof ZodError) {
      console.log(`Invalid config:${formatErrors(err.issues.map((issue) => `${issue.path}: ${issue.message}`))}`);
    } else if (err) {
      console.log(`Unhandled application error:`);
      console.log(err);
    } else if (msg !== null) {
      yargs.showHelp();
      console.log('\n' + msg);
    } else {
      console.log('Daemon terminated unexpectedly');
    }

    console.log('');
    process.exit(1);
  })
  .strict()
  .help()
  .alias('h', 'help')
  .parse();
