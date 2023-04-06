import { ApplicationRequestReply, DaemonApplicationRequestReply } from '../common';
import {
  ensureIterable,
  IpcPeer,
  isAsyncIterable,
  isChildProcess,
  JsonObject,
  JsonSerializable,
  NativeIpcTransport,
  UnixSocketIpcTransport,
} from '../ipc';
import { createPromise, EventEmitter, EventMap, PromiseApi, sleep } from '../utils';
import { WorkerIpcIncomingMap, WorkerIpcOutgoingMap } from './types';

type NodesockdWorkerOptions = {
  id?: string;
  name?: string;
  suspended?: boolean;
  socketPath?: string;
};

export interface NodesockdWorkerEvents extends EventMap {
  message: [message: string, data?: JsonObject];
  shutdown: [];
}

export class NodesockdWorker extends EventEmitter<NodesockdWorkerEvents> {
  private readonly options: NodesockdWorkerOptions;
  private ipc?: IpcPeer<WorkerIpcOutgoingMap, WorkerIpcIncomingMap>;
  private resume?: PromiseApi<void>;
  private detached: boolean = false;

  constructor(appName?: string) {
    super();
    this.options = getOptionsFromEnv();
    appName !== undefined && (this.options.name = appName);

    if (isChildProcess(process)) {
      this.ipc = new IpcPeer(new NativeIpcTransport(process));
    }

    this.resume = this.ipc && this.options.suspended ? createPromise() : undefined;
  }

  async run(): Promise<void> {
    this.setProcessTitle();

    if (this.ipc) {
      this.ipc.setMessageHandler('app-msg', ({ message, data }) => {
        this.emit('message', message, data)
      });

      this.ipc.setRequestHandler('app-req', async ({ request, data }) => {
        return this.processApplicationRequest(request, data)
      });

      this.ipc.setMessageHandler('resume', async () => this.handleResume());
      this.ipc.setMessageHandler('detach', async ({ ipcPath }) => this.handleDetach(ipcPath));
      this.ipc.setMessageHandler('shutdown', async () => this.handleShutdown());
      this.ipc.setMessageHandler('set-name', async ({ name }) => this.handleSetName(name));

      await this.ipc.run();
    }
  }

  get id(): string | undefined {
    return this.options.id;
  }

  get resumed(): Promise<void> {
    return this.resume?.promise ?? Promise.resolve();
  }

  get socketPath(): string | undefined {
    return this.options.socketPath;
  }

  get suspendMiddleware() {
    return async (req: any, res: any, next: () => void) => {
      await this.resumed;
      return next();
    };
  }

  async reportOnline(): Promise<void> {
    await this.ipc?.sendMessage('online', {
      id: this.options.id!,
      pid: process.pid,
      suspended: !!this.resume,
    });
  }

  async reportBroken(reason?: string): Promise<void> {
    if (this.ipc) {
      await this.ipc.sendMessage('broken', {
        id: this.options.id!,
        pid: process.pid,
        reason,
      });
    } else {
      Promise.resolve().then(() => this.handleShutdown());
    }
  }

  async sendAppMessage(message: string, data?: JsonObject, workers?: string): Promise<void> {
    await this.ipc?.sendRequest('send-app-msg', { message, data, workers });
  }

  async * sendAppRequest(request: string, data?: JsonObject, workers?: string): AsyncIterableIterator<DaemonApplicationRequestReply> {
    if (!this.ipc) {
      return;
    }

    const reply = await this.ipc.sendRequest('send-app-req', { request, data, workers });
    yield * ensureIterable(reply);
  }

  protected handleApplicationRequest(
    request: string,
    data?: JsonObject,
  ): AsyncIterableIterator<JsonSerializable> | Promise<JsonSerializable> | JsonSerializable {
    throw new Error(`Unhandled application request: ${request}`);
  }

  private async processApplicationRequest(
    request: string,
    data?: JsonObject,
  ): Promise<AsyncIterableIterator<ApplicationRequestReply> | ApplicationRequestReply> {
    const reply = await this.handleApplicationRequest(request, data);

    if (isAsyncIterable(reply)) {
      return (async function * () {
        for await (const data of reply) {
          yield { pid: process.pid, data };
        }
      })();
    } else {
      return {
        pid: process.pid,
        data: reply,
      };
    }
  }

  private setProcessTitle(): void {
    process.title = `${this.options.name ?? 'app'} worker '${this.options.id ?? '?'}'`;
  }

  private handleResume(): void {
    this.resume?.resolve();
    this.resume = undefined;
  }

  private async handleDetach(ipcPath: string): Promise<void> {
    if (!this.ipc || this.detached) {
      return;
    }

    this.detached = true;
    await sleep(500);
    await this.ipc.terminate();

    this.ipc = new IpcPeer(new UnixSocketIpcTransport(ipcPath));

    while (true) {
      try {
        await this.run();
        await this.reportOnline();
        break;
      } catch {
        await sleep(250);
      }
    }
  }

  private async handleShutdown(): Promise<void> {
    await this.ipc?.terminate();
    this.emit('shutdown');
  }

  private handleSetName(name: string): void {
    this.options.name = name;
    this.setProcessTitle();
  }
}

function getOptionsFromEnv(): NodesockdWorkerOptions {
  const id = getEnv('WORKER_ID');
  const name = getEnv('APP_NAME');
  const suspended = getEnv('SUSPENDED', (v) => v === 'true');
  const socketPath = getEnv('SOCKET_PATH');

  return {
    id,
    name,
    suspended,
    socketPath,
  };
}

function getEnv<R = string>(name: string, xform?: (value: string) => R): R | undefined {
  const value = process.env[`NODESOCKD_${name}`];
  return !xform || value === undefined ? value : xform(value) as any;
}
