import { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
import { DaemonApplicationRequestReply, JsonObject, NodesockdClient } from '../client';
import { resolveIpcFile } from '../common';
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
      const ipcFile = await resolveIpcFile(args.ipc, args.config);
      const client = new NodesockdClient(ipcFile);

      try {
        await client.run();
      } catch (e) {
        if (e instanceof IpcConnectError) {
          console.log(`Failed to connect to IPC socket '${ipcFile}'. Is the Nodesockd daemon running?`);
          process.exit(1);
        } else {
          throw e;
        }
      }

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

export function formatReply(reply: DaemonApplicationRequestReply): string {
  const prefix = `${reply.id} (${reply.pid})`.padEnd(12, ' ');
  let content: string;

  if (reply.errors) {
    content = reply.errors.length > 1
      ? `Errors:\n - ${reply.errors.join('\n - ')}`
      : `Error: ${reply.errors.join('')}`;
  } else if (reply.data !== undefined) {
    content = typeof reply.data !== 'string' ? JSON.stringify(reply.data, null, 2) : reply.data;
  } else {
    content = `(empty reply)`;
  }

  return `${prefix} | ${content.replace(/\n/g, '\n             | ')}`;
}

export async function waitForPidToTerminate(pid: number): Promise<void> {
  while (true) {
    try {
      process.kill(pid, 0);
      break;
    } catch (e) {
      await sleep(250);
    }
  }
}
