import { dump } from 'js-yaml';
import { CommandModule } from 'yargs';
import { resolveConfig } from '../common';
import { Daemon } from '../daemon';
import { IpcRequestError } from '../ipc';
import { shortId, sleep } from '../utils';
import {
  coerceBooleanOrNumber,
  coerceJson,
  compareWorkerStates,
  createClient,
  createCommand,
  formatReply,
  formatTs,
  pad,
  waitForPidToTerminate,
} from './utils';

export type DaemonArgs = {
  config?: string;
  devServer?: number | boolean;
};

export const daemon: CommandModule<DaemonArgs, DaemonArgs> = {
  command: 'daemon',
  describe: 'Run the Nodesockd daemon',
  builder: (args) => args
    .string('config').alias('c', 'config')
    .string('dev-server').alias('d', 'dev-server').coerce('dev-server', coerceBooleanOrNumber),
  handler: async (args) => {
    const [config, files] = await resolveConfig(args.config);
    const daemon = new Daemon(config, files, args.devServer);
    await daemon.run();
  },
};


export const getStatus = createCommand('status', 'Get daemon status', async (client) => {
  const status = await client.getStatus();

  console.log(`Nodesockd daemon ${status.version} is running with PID ${status.pid} since ${formatTs(status.startTs)}.`);

  const idxLen = Math.max(1, ...status.workers.map((w) => (w.idx ?? 0).toString().length));
  const pidLen = Math.max(3, ...status.workers.map((w) => (w.pid ?? 0).toString().length));

  console.log(`\nWorkers:\n`);
  console.log(`|${' '.repeat(idxLen)}# | ID    | PID${' '.repeat(pidLen - 3)} | State                        |`);
  console.log(`|${'-'.repeat(idxLen)}--|-------|----${'-'.repeat(pidLen - 3)}-|------------------------------|`);

  for (const w of status.workers.sort(compareWorkerStates)) {
    const parts = [
      pad(w.idx, idxLen),
      shortId(w.id),
      pad(w.pid, pidLen),
      `${w.state.padEnd(11, ' ')} (${formatTs(w.stateTs)})`,
    ];

    console.log(`| ${parts.join(' | ')} |`);
  }

  console.log('\n');
});

export const getConfig = createCommand('config', 'Get daemon config', async (client) => {
  const { config, files } = await client.getConfig();

  console.log(`Current daemon config:`);
  console.log(dump(config).replace(/^/gm, '  '));
  console.log(`Loaded files:\n - ${files.join('\n - ')}`);
});

export const start = createCommand(
  'start',
  'Start workers',
  (args) => args
    .boolean('suspended').alias('s', 'suspended')
    .number('max-attempts').alias('m', 'max-attempts'),
  async (client, { suspended, maxAttempts }) => {
    await client.startWorkers(suspended, maxAttempts);
  },
);

export const restart = createCommand(
  'restart',
  'Restart workers',
  (args) => args
    .boolean('suspended').alias('s', 'suspended')
    .number('max-attempts').alias('m', 'max-attempts')
    .boolean('upgrade').alias('u', 'upgrade'),
  async (client, { suspended, maxAttempts, upgrade, ipc, config }) => {
    if (upgrade) {
      const { upgrading, pid } = await client.restartWorkers(suspended, maxAttempts, upgrade);

      if (upgrading) {
        console.log(`Daemon process with PID ${pid} is upgrading.`);
        console.log('Waiting for the old daemon process to terminate...');
        await client.terminate();

        await waitForPidToTerminate(pid);

        console.log('Waiting for a new daemon process to come online...');
        client = await createClient(ipc, config, true);
        await sleep(2500); // ensure adoption period has passed
      } else {
        console.log(`Daemon process with PID ${pid} is already the latest version.`);
        return;
      }
    }

    await client.restartWorkers(suspended, maxAttempts);
    await client.terminate();
  },
);

export const resume = createCommand('resume', 'Resume suspended workers', async (client) => {
  await client.resumeWorkers();
});

export const stop = createCommand('stop', 'Stop workers', async (client) => {
  await client.stopWorkers();
});

export const setWorkerCount = createCommand(
  'set-workers <count>',
  'Set worker count',
  (args) => args.positional('count', { type: 'number', demandOption: true }),
  async (client, { count }) => {
    await client.setWorkerCount(count);
  },
);

export const setStandbyCount = createCommand(
  'set-standby <count>',
  'Set standby count',
  (args) => args.positional('count', { type: 'number', demandOption: true }),
  async (client, { count }) => {
    await client.setStandbyCount(count);
  },
);

export const reloadDaemonConfig = createCommand(
  'reload',
  'Ask the daemon to reload its config',
  async (client) => {
    await client.reloadConfig();
  },
);

export const terminateDaemon = createCommand(
  'terminate',
  'Ask the daemon to terminate',
  async (client) => {
    const pid = await client.terminateDaemon();
    await client.terminate();
    await waitForPidToTerminate(pid);
  },
);

export const sendAppMessage = createCommand(
  'send-msg <message> [data]',
  'Send a message to all workers',
  (args) => args
    .positional('message', { type: 'string', demandOption: true })
    .positional('data', { type: 'string' }).coerce('data', coerceJson)
    .string('workers').alias('workers', 'w'),
  async (client, { message, data, workers }) => {
    await client.sendAppMessage(message, data, workers);
  },
);

export const sendAppRequest = createCommand(
  'send-req <request> [data]',
  'Send a request to all workers and print their output',
  (args) => args
    .positional('request', { type: 'string', demandOption: true })
    .positional('data', { type: 'string' }).coerce('data', coerceJson)
    .string('workers').alias('workers', 'w'),
  async (client, { request, data, workers }) => {
    try {
      const replies = client.sendAppRequest(request, data, workers);

      for await (const reply of replies) {
        console.log(formatReply(reply));
      }
    } catch (e) {
      if (e instanceof IpcRequestError) {
        if (e.errors.length > 1) {
          console.log(`Errors:\n - ${e.errors.join('\n - ')}`);
        } else {
          console.log(...e.errors);
        }
      } else {
        throw e;
      }
    }
  },
);
