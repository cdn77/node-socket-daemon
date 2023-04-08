import { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
import {
  DaemonApplicationRequestReply,
  JsonObject,
  NodesockdClient,
  WorkerStatus,
} from '../client';
import { resolveIpcFile } from '../common';
import { isPidAlive } from '../daemon';
import { IpcConnectError, IpcRequestError } from '../ipc';
import { sleep } from '../utils';

export type CommonArgs = {
  config?: string;
  ipc?: string;
};

type Builder<Args> = (args: Argv<CommonArgs>) => Argv<CommonArgs & Args>;
type Handler<Args> = (client: NodesockdClient, args: ArgumentsCamelCase<CommonArgs & Args>) => Promise<void>;

function common<Args>(args: Argv<Args>): Argv<Args & CommonArgs> {
  return args
    .string('config').alias('c', 'config')
    .string('ipc').alias('i', 'ipc');
}

export async function createClient(ipc?: string, config?: string, retry: boolean = false): Promise<NodesockdClient> {
  const ipcFile = await resolveIpcFile(ipc, config);
  const client = new NodesockdClient(ipcFile);

  while (true) {
    try {
      await client.run();
      return client;
    } catch (e) {
      if (retry) {
        await sleep(250);
        continue;
      }

      if (e instanceof IpcConnectError) {
        console.log(`Failed to connect to IPC socket '${ipcFile}'. Is the Nodesockd daemon running?`);
        process.exit(1);
      } else {
        throw e;
      }
    }
  }
}

export function createCommand(
  command: string,
  describe: string,
  handler: Handler<{}>,
): CommandModule<CommonArgs, CommonArgs>;
export function createCommand<Args>(
  command: string,
  describe: string,
  builder: Builder<Args>,
  handler: Handler<Args>,
): CommandModule<CommonArgs, CommonArgs>;
export function createCommand<Args>(
  command: string,
  describe: string,
  builderOrHandler: Builder<Args> | Handler<Args>,
  maybeHandler?: Handler<Args>,
): CommandModule<Args & CommonArgs, Args & CommonArgs> {
  const [builder, handler] = maybeHandler
    ? [builderOrHandler as Builder<Args>, maybeHandler]
    : [undefined, builderOrHandler as Handler<Args>];

  return {
    command,
    describe,
    builder: (args) => builder ? builder(common(args)) : common(args),
    handler: async (args) => {
      const client = await createClient(args.ipc, args.config);

      try {
        await handler(client, args);
      } catch (e) {
        if (e instanceof IpcRequestError) {
          console.log(
            e.errors.length > 1
              ? `Errors:\n - ${e.errors.join('\n - ')}`
              : `Error: ${e.errors.join('')}`,
          );
          process.exit(1);
        } else {
          throw e;
        }
      }

      await client.terminate();
    },
  };
}

export function compareWorkerStates(a: WorkerStatus, b: WorkerStatus): number {
  return ((a.idx ?? 1e9) - (b.idx ?? 1e9)) || ((a.pid ?? 1e9) - (b.pid ?? 1e9));
}

export function formatTs(ts?: number): string {
  if (!ts) {
    return '              ';
  }

  const dt = new Date(ts);
  const d = pad(dt.getDate());
  const m = pad(dt.getMonth() + 1);
  const h = pad(dt.getHours());
  const i = pad(dt.getMinutes(), 2, '0');
  const s = pad(dt.getSeconds(), 2, '0');
  return `${d}/${m} ${h}:${i}:${s}`;
}

export function pad(value: number | string | undefined, length: number = 2, char: string = ' '): string {
  return value === undefined
    ? char.repeat(length)
    : value.toString().padStart(length, char);
}

export function coerceJson(value?: string): JsonObject | undefined {
  if (value === undefined) {
    return undefined;
  }

  const data = JSON.parse(value);

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('A JSON object must be specified');
  }

  return data;
}

export function formatErrors(errors: string[]): string {
  return errors.length > 1 ? `\n - ${errors.join('\n - ')}` : ` ${errors.join('')}`;
}

export function formatReply(reply: DaemonApplicationRequestReply): string {
  const prefix = `${reply.id} (${reply.pid})`.padEnd(12, ' ');
  let content: string;

  if (reply.errors) {
    content = `Error:${formatErrors(reply.errors)}`;
  } else if (reply.data !== undefined) {
    content = typeof reply.data !== 'string' ? JSON.stringify(reply.data, null, 2) : reply.data;
  } else {
    content = `(empty reply)`;
  }

  return `${prefix} | ${content.replace(/\n/g, '\n             | ')}`;
}

export async function waitForPidToTerminate(pid: number): Promise<void> {
  while (isPidAlive(pid)) {
    await sleep(250);
  }
}
