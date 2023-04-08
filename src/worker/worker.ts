import { ApplicationRequestReply, DaemonApplicationRequestReply } from '../common';
import {
  AnyIpcHandler,
  ensureIterable,
  IpcPeer,
  isAsyncIterable,
  isChildProcess,
  JsonObject,
  mapAsyncIterable,
  NativeIpcTransport,
  UnixSocketIpcTransport,
} from '../ipc';
import { createPromise, EventEmitter, EventMap, PromiseApi, sleep } from '../utils';
import { WorkerIpcIncomingMap, WorkerIpcOutgoingMap } from './types';
import { getOptionsFromEnv, NodesockdWorkerOptions } from './utils';


export interface NodesockdWorkerEvents extends EventMap {
  message: [message: string, data?: JsonObject];
  shutdown: [];
}

class NodesockdWorker extends EventEmitter<NodesockdWorkerEvents> {
  private readonly options: NodesockdWorkerOptions;
  private readonly requestHandlers: Map<string, AnyIpcHandler> = new Map();
  private ipc?: IpcPeer<WorkerIpcOutgoingMap, WorkerIpcIncomingMap>;
  private resume?: PromiseApi<void>;
  private detached: boolean = false;
  private adopted: boolean = false;
  private broken?: { reason?: string };

  constructor(appName?: string) {
    super();
    this.options = getOptionsFromEnv();
    appName !== undefined && (this.options.name = appName);

    if (isChildProcess(process)) {
      this.ipc = new IpcPeer(new NativeIpcTransport(process));
    }

    if (this.ipc && this.options.suspended) {
      this.resume = createPromise();
    }
  }

  async run(): Promise<void> {
    this.setProcessTitle();

    if (this.ipc) {
      this.ipc.setMessageHandler('app-msg', ({ message, data }) => {
        this.emit('message', message, data)
      });

      this.ipc.setRequestHandler('app-req', async ({ request, data }) => {
        return this.handleApplicationRequest(request, data)
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

  get shortId(): string | undefined {
    return this.options.id?.slice(-5);
  }

  get suspended(): boolean {
    return this.options.suspended;
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
    if (!this.detached) {
      await this.reportState();
    }
  }

  async reportBroken(reason?: string): Promise<void> {
    this.broken = { reason };

    if (!this.ipc) {
      Promise.resolve().then(() => this.handleShutdown());
    } else if (!this.detached || this.adopted) {
      await this.reportState();
    }
  }

  async sendAppMessage(message: string, data?: JsonObject, workers?: string): Promise<void> {
    await this.ipc?.sendRequest('send-app-msg', { message, data, workers });
  }

  async * sendAppRequest(request: string, data?: JsonObject, workers?: string): AsyncIterableIterator<DaemonApplicationRequestReply> {
    if (!this.ipc) {
      throw new Error('Cannot send an app request when worker is running in standalone mode');
    }

    const reply = await this.ipc.sendRequest('send-app-req', { request, data, workers });
    yield * ensureIterable(reply);
  }

  setRequestHandler(request: string, handler: AnyIpcHandler): void {
    this.requestHandlers.set(request, handler);
  }

  private async handleApplicationRequest(
    request: string,
    data?: JsonObject,
  ): Promise<AsyncIterableIterator<ApplicationRequestReply> | ApplicationRequestReply> {
    const handler = this.requestHandlers.get(request);

    if (!handler) {
      throw new Error(`Unhandled application request: ${request}`);
    }

    const reply = await handler(data);

    if (isAsyncIterable(reply)) {
      return mapAsyncIterable(reply, (data) => ({
        pid: process.pid,
        data,
      }));
    } else {
      return {
        pid: process.pid,
        data: reply,
      };
    }
  }

  private setProcessTitle(): void {
    process.title = `${this.options.name ?? 'app'} worker '${this.shortId ?? '?'}'`;
  }

  private async reportState(): Promise<boolean> {
    if (!this.ipc || this.options.id === undefined) {
      return false;
    }

    const [state, data] = this.broken !== undefined
      ? ['broken', this.broken] as const
      : ['online', { suspended: this.options.suspended }] as const;

    await this.ipc.sendMessage(state, {
      id: this.options.id,
      pid: process.pid,
      ...data,
    });

    return true;
  }

  private handleResume(): void {
    this.options.suspended = false;
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
        await this.reportState();
        this.adopted = true;
        break;
      } catch {
        await sleep(250);
      }
    }
  }

  private async handleShutdown(): Promise<void> {
    await this.ipc?.terminate();
    this.ipc = undefined;
    this.emit('shutdown');
  }

  private handleSetName(name: string): void {
    this.options.name = name;
    this.setProcessTitle();
  }
}

const nodesockd = new NodesockdWorker();
nodesockd.run();

export { nodesockd };
export type { NodesockdWorker };
