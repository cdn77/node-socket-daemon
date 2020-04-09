#!/usr/bin/env node

import * as yargs from 'yargs';
import { Client } from './client';
import { Daemon } from './daemon';

process.umask(0o117);

const type = {
  string: 'string' as 'string',
  boolean: 'boolean' as 'boolean',
  number: 'number' as 'number',
};

const commonOptions = {
  config: {
    alias: 'c',
    type: type.string,
    description: 'Config file path',
  },
  ipcFile: {
    alias: 'i',
    type: type.string,
    description: 'IPC file name',
  },
};

const suspendOptions = {
  suspended: {
    alias: 'u',
    type: type.boolean,
    description: 'Start new workers in suspended mode',
  },
};

function createClientHandler<O>(handler: (client: Client, options: O) => Promise<void> | void) {
  return async (rawOptions: O) => {
    try {
      const options = await Client.processOptions(rawOptions);
      await handler(new Client(options), rawOptions);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  };
}

function createDaemonHandler<O>(handler: (daemon: Daemon, options: O) => Promise<void> | void) {
  return async (rawOptions: O) => {
    try {
      const options = await Daemon.processOptions(rawOptions);
      await handler(new Daemon(options), rawOptions);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  };
}

yargs.command(
  'start',
  'Start workers',
  {
    ...commonOptions,
    ...suspendOptions,
  },
  createClientHandler(async (client, options) => client.start(options.suspended)),
);

yargs.command(
  'stop',
  'Stop workers',
  {
    ...commonOptions,
  },
  createClientHandler(async (client) => client.stop()),
);

yargs.command(
  'restart',
  'Restart workers',
  {
    ...commonOptions,
    ...suspendOptions,
  },
  createClientHandler(async (client, options) => client.restart(options.suspended)),
);

yargs.command(
  'resume',
  'Resume suspended workers',
  {
    ...commonOptions,
  },
  createClientHandler(async (client) => client.resume()),
);

yargs.command(
  'send <msg>',
  'Send custom message to workers',
  {
    ...commonOptions,
    msg: {
      type: type.string,
      demandOption: true,
    },
  },
  createClientHandler(async (client, options) => client.sendMessage(options.msg)),
);

yargs.command(
  ['daemon', '$0'],
  'Run main daemon',
  {
    ...commonOptions,
    script: {
      alias: 's',
      type: type.string,
      description: 'Main script path',
    },
    listenVar: {
      alias: 'l',
      type: type.string,
      description: 'Listen env var name',
    },
    tmpDir: {
      alias: 't',
      type: type.string,
      description: 'Temp directory path',
    },
    socketFile: {
      alias: 'o',
      type: type.string,
      description: 'Socket file name',
    },
    workers: {
      alias: 'w',
      type: type.number,
      description: 'Number of workers to run',
    },
    env: {
      alias: 'e',
      array: true,
      type: 'string',
      description: 'Environment variable whitelist',
    },
  },
  createDaemonHandler(async (daemon) => daemon.run()),
);

yargs
  .strict()
  .demandCommand()
  .alias({
    h: 'help',
    v: 'version',
  })
  .parse();
