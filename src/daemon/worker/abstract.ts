import { Logger } from '@debugr/core';
import {
  DaemonApplicationRequestReply, DaemonSendApplicationMessage, DaemonSendApplicationRequest,
  WorkerOptions,
  WorkerState,
  WorkerStatus,
} from '../../common';
import { ensureIterable, IpcPeer, IpcRequestError, JsonObject } from '../../ipc';
import { createPromise, EventEmitter, EventMap, PromiseApi, shortId, sleep } from '../../utils';
import { WorkerProcessIpcIncomingMap, WorkerProcessIpcOutgoingMap } from '../types';

export interface WorkerProcessEvents extends EventMap {
  'broken': [worker: AbstractWorkerProcess, reason?: string];
  'terminated': [worker: AbstractWorkerProcess];
}

export interface ApplicationMessageApi {
  sendAppMessage(data: DaemonSendApplicationMessage): Promise<void> | void;
  sendAppRequest(data: DaemonSendApplicationRequest): AsyncIterableIterator<DaemonApplicationRequestReply>;
}

export type WorkerIpcPeer = IpcPeer<WorkerProcessIpcOutgoingMap, WorkerProcessIpcIncomingMap>;

export abstract class AbstractWorkerProcess extends EventEmitter<WorkerProcessEvents> {
  protected readonly options: WorkerOptions;
  protected readonly status: WorkerStatus;
  protected readonly logger: Logger;
  private readonly api: ApplicationMessageApi;
  private readonly _shortId: string;
  protected readonly _online: PromiseApi<void> = createPromise();
  private _onlineUsed: boolean = false;
  private _terminated?: PromiseApi<void>;
  private _ipc?: WorkerIpcPeer;

  constructor(id: string, options: WorkerOptions, logger: Logger, api: ApplicationMessageApi) {
    super();
    this.options = options;
    this.status = {
      id,
      state: 'running',
      stateTs: Date.now(),
    };
    this.logger = logger;
    this.api = api;
    this._shortId = shortId(id);
    this.terminated = this.terminated.bind(this);
  }

  async init(pid: number, ipc: WorkerIpcPeer): Promise<void> {
    this.status.pid = pid;
    this._ipc = ipc;
    this._ipc.setMessageHandler('online', ({ suspended }) => this.handleOnline(suspended));
    this._ipc.setMessageHandler('broken', ({ reason }) => this.handleBroken(reason));
    this._ipc.setRequestHandler('send-app-msg', this.api.sendAppMessage);
    this._ipc.setRequestHandler('send-app-req', this.api.sendAppRequest);
    await this._ipc.run();
  }

  getStatus(): Readonly<WorkerStatus> {
    return this.status;
  }

  get id(): string {
    return this.status.id;
  }

  get id5(): string {
    return this._shortId;
  }

  get descr(): string {
    return this.pid !== undefined ? `'${this.id5}' (pid: ${this.pid})` : `'${this.id5}'`;
  }

  get pid(): number | undefined {
    return this.status.pid;
  }

  get idx(): number | undefined {
    return this.status.idx;
  }

  get online(): Promise<void> {
    this._onlineUsed = true;
    return this._online.promise;
  }

  setIndex(idx: number): void {
    this.status.idx = idx;
  }

  async resume(): Promise<void> {
    if (this.isInState('suspended')) {
      await this.ipc.sendMessage('resume');
      this._online.resolve();
      this.setState('online');
    }
  }

  async setName(name: string): Promise<void> {
    await this.ipc.sendMessage('set-name', { name });
  }

  async sendAppMessage(message: string, data?: JsonObject): Promise<void> {
    this.logger.debug(`Sending app message '${message}' to worker ${this.descr}...`, data);
    await this.ipc.sendMessage('app-msg', { message, data });
  }

  async * sendAppRequest(request: string, data?: JsonObject): AsyncIterableIterator<DaemonApplicationRequestReply> {
    try {
      this.logger.debug(`Sending app request '${request}' to worker ${this.descr}...`, data);
      const result = await this.ipc.sendRequest('app-req', { request, data });

      for await (const reply of ensureIterable(result)) {
        yield {
          id: this.status.id,
          ...reply,
        };
      }
    } catch (e) {
      if (e instanceof IpcRequestError) {
        yield {
          id: this.status.id,
          pid: this.status.pid ?? -1,
          errors: e.errors,
        }
      } else {
        throw e;
      }
    }
  }

  handleOnline(suspended?: boolean): void {
    const state = suspended ? 'suspended' : 'online';

    if (!this.isInState('running')) {
      throw new Error(`Cannot change worker ${this.descr} state from '${this.status.state}' to '${state}'`);
    }

    this.logger.info(`Worker ${this.descr} is online`);
    this.setState(state);
    this._online.resolve();
  }

  handleBroken(reason?: string): void {
    this.logger.warning(`Worker ${this.descr} reported itself as broken, reason: ${reason ?? 'unknown'}`);
    this.setState('broken');
    this.emit('broken', this, reason);
  }

  async detach(ipcPath: string): Promise<void> {
    if (this.isInState('running')) {
      await this._online.promise;
    }

    if (this.isInState('online', 'suspended')) {
      await this.ipc.sendMessage('detach', { ipcPath });
      await this.ipc.terminate();
      this.detached();
    } else {
      await this.terminate();
    }
  }

  protected detached(): void {}

  async terminate(): Promise<void> {
    if (this._terminated) {
      return this._terminated.promise;
    } else if (this.status.pid === undefined || this.isInState('terminating', 'dead')) {
      return;
    }

    this.logger.debug(`Terminating worker ${this.descr}...`);
    this.setState('terminating');
    this._terminated = createPromise();

    const t0 = Date.now();
    const pid = this.status.pid;
    const actions: [number, () => Promise<any> | any][] = [
      [this.options.shutdownTimeout, () => process.kill(pid, 'SIGTERM')],
      [this.options.shutdownTimeout + 5000, () => process.kill(pid, 'SIGKILL')],
      [this.options.shutdownTimeout + 10000, () => { throw new Error(`Failed to terminate worker ${this.descr}`); }],
    ];

    await this.ipc.sendMessage('shutdown');
    await this.ipc.terminate();

    while (this.status.state !== 'dead') {
      if (actions.length && Date.now() >= t0 + actions[0][0]) {
        const [, action] = actions.shift()!;
        await action();
      }

      await Promise.race([sleep(250), this._terminated.promise]);
    }

    this._terminated.resolve();
    this.logger.info(`Worker ${this.descr} terminated`);
  }

  isInState(...allowed: WorkerState[]): boolean {
    return allowed.includes(this.status.state);
  }

  protected get ipc(): WorkerIpcPeer {
    if (!this._ipc) {
      throw new Error(`Worker ${this.descr} was not properly initialised: no access to IPC`);
    }

    return this._ipc;
  }

  protected setState(state: WorkerState): void {
    this.status.state = state;
    this.status.stateTs = Date.now();
  }

  protected async terminated(): Promise<void> {
    if (this.isInState('dead')) {
      return;
    }

    this.setState('dead');
    this._onlineUsed ? this._online.reject() : this._online.resolve();
    this._terminated?.resolve();
    await this.ipc.terminate();
    this.emit('terminated', this);
  }
}
