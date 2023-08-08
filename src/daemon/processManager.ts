import { Logger } from '@debugr/core';
import { rename, symlink, unlink } from 'fs/promises';
import { v4 } from 'uuid';
import {
  Config,
  DaemonApplicationRequestReply,
  WorkerBroken,
  WorkerOnline,
  WorkerStatus,
} from '../common';
import { IpcPeer, JsonObject } from '../ipc';
import {
  consumeAsyncResources,
  EventEmitter,
  EventMap,
  ParallelTask, ParallelTaskFailed,
  ParallelTaskGroup,
  PromiseTimedOut,
  shortId,
  sleep,
} from '../utils';
import { buildWorkerEnv, compareConfig } from './utils';
import {
  AbstractWorkerProcess,
  AdoptedWorkerProcess,
  ApplicationMessageApi,
  SpawnedWorkerProcess,
  WorkerSet,
} from './worker';

export interface ProcessManagerEvents extends EventMap {
  online: [socketPath: string];
  offline: [socketPath: string];
}

export class ProcessManager extends EventEmitter<ProcessManagerEvents> {
  private readonly logger: Logger;
  private config: Config;
  private readonly workers: WorkerSet = new WorkerSet();
  private adopting: boolean = true;
  private running: boolean = false;

  constructor(logger: Logger, config: Config) {
    super();
    this.logger = logger;
    this.config = config;

    this.handleWorkerBroken = this.handleWorkerBroken.bind(this);
    this.handleWorkerTerminated = this.handleWorkerTerminated.bind(this);
  }

  async run(): Promise<void> {
    this.running = true;
    await sleep(2000);
    await this.setWorkerCount(this.config.workers);
    await this.setStandbyCount(this.config.standby);
    this.adopting = false;
  }

  async start(suspended?: boolean, maxAttempts?: number): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.logger.info('Starting workers...');
    await this.startWorkers(suspended, maxAttempts);
  }

  async restart(suspended?: boolean, maxAttempts?: number): Promise<void> {
    this.running = true;
    this.logger.info('Restarting workers...');
    await this.startWorkers(suspended, maxAttempts);
  }

  async resume(): Promise<void> {
    if (!this.running) {
      throw new Error('Cannot resume: workers are not running');
    }

    this.logger.info('Resuming suspended workers...');
    await Promise.all(this.workers.mapCurrent(async (worker) => worker.resume()));
  }

  async stop(detach: boolean = false): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (detach) {
      this.logger.info('Detaching from workers...');
      await Promise.all(this.workers.mapAll(async (worker) => worker.detach(this.config.ipcFile)));
    } else {
      this.logger.info('Stopping workers...');
      await Promise.all(this.workers.mapAll(async (worker) => worker.terminate()));
    }

    await sleep(500); // just give some final tasks a while to complete
  }

  getStates(): WorkerStatus[] {
    return this.workers.mapAll((worker) => worker.getStatus());
  }

  async handleOnline(peer: IpcPeer<any, any>, { id, pid, suspended }: WorkerOnline): Promise<void> {
    if (!this.adopting) {
      const worker = await this.adoptWorker(peer, id, pid);
      await worker.terminate();
      return;
    } else if (this.workers.has(id)) {
      return;
    }

    const worker = await this.adoptWorker(peer, id, pid, suspended || this.workers.size);
    worker.handleOnline(suspended);

    if (!suspended) {
      // the adopted process probably already has its symlink in place,
      // but we don't know its original index and so when the worker
      // eventually terminates, we might clean up the wrong symlink -
      // this way we're sure the adopted worker's symlink is the correct
      // one, even though it might mean that the symlinks get reassigned
      // to different workers during adoption
      await this.symlinkSocket(worker);
    }
  }

  async handleBroken(peer: IpcPeer<any, any>, { id, pid, reason }: WorkerBroken): Promise<void> {
    const worker = this.workers.get(id) ?? await this.adoptWorker(peer, id, pid);
    worker.handleBroken(reason);
  }

  async setConfig(config: Config): Promise<void> {
    const actions = compareConfig(this.config, config);
    this.config = config;

    for (const action of actions) {
      switch (action) {
        case 'restart':
          await this.restart();
          break;
        case 'set-name':
          await Promise.all(this.workers.mapAll(async (worker) => {
            if (worker.isInState('running', 'online', 'suspended')) {
              await worker.setName(this.config.name);
            }
          }));
          break;
        case 'set-workers':
          await this.setWorkerCount(this.config.workers);
          break;
        case 'set-standby':
          await this.setStandbyCount(this.config.standby);
          break;
      }
    }
  }

  async setWorkerCount(count: number): Promise<void> {
    if (count !== this.workers.size) {
      this.logger.info(`Updating worker count from ${this.workers.size} to ${count}...`);
      this.config.workers = count;
      await this.adjustWorkerCount(count, this.workers.size);
    }
  }

  async setStandbyCount(count: number): Promise<void> {
    if (count !== this.workers.standbys) {
      this.logger.info(`Updating standby count from ${this.workers.standbys} to ${count}...`);
      this.config.standby = count;
      await this.adjustWorkerCount(count, this.workers.standbys, true);
    }
  }

  async sendAppMessage(message: string, data?: JsonObject, workers?: string, sender?: string): Promise<void> {
    await Promise.all(this.workers.resolve(workers, sender).map(async (worker) => {
      await worker.sendAppMessage(message, data);
    }));
  }

  sendAppRequest(
    request: string,
    data?: JsonObject,
    workers?: string,
    sender?: string,
  ): AsyncIterableIterator<DaemonApplicationRequestReply> {
    const requests = this.workers.resolve(workers, sender).map((worker) => {
      return worker.sendAppRequest(request, data);
    });

    return consumeAsyncResources(requests);
  }

  private async startWorkers(suspended?: boolean, maxAttempts?: number): Promise<void> {
    maxAttempts ??= this.config.options.maxStartAttempts;
    const queue: Promise<any>[] = [];
    const group = new ParallelTaskGroup();

    for (let i = 0; i < this.config.workers; ++i) {
      queue.push(this.startWorker(i, suspended, maxAttempts, group.createTask()));
    }

    const standbys = this.workers.ejectStandby();

    for (let i = 0; i < this.config.standby; ++i) {
      queue.push(this.startWorker(true, suspended, maxAttempts, group.createTask()));
    }

    queue.length && await Promise.all(queue);
    standbys.length && await Promise.all(standbys.map((standby) => standby.terminate()));
  }

  private async startWorker(idxOrStandby: number | true, suspended?: boolean, maxAttempts?: number, task?: ParallelTask): Promise<void> {
    const standby = typeof idxOrStandby === 'boolean';
    const previous = !standby && this.workers.getCurrent(idxOrStandby);
    const [pre, post] = idxOrStandby === true ? ['standby ', ''] : ['', ` #${idxOrStandby}`];

    while (this.running) {
      if (maxAttempts !== undefined && --maxAttempts < 0) {
        this.logger.warning(`Unable to start new ${pre}worker${post}, worker failed too many times`);
        task?.fail();
        throw new Error(`Failed to start one or more workers`);
      }

      const id = v4();
      this.logger.info(`Starting new ${pre}worker${post} '${shortId(id)}'...`);
      const worker = this.createWorker(id, idxOrStandby);

      try {
        this.logger.debug(`Spawning worker ${worker.descr}...`);
        await worker.spawn(
          this.config.script,
          buildWorkerEnv(this.config, id, this.formatWorkerSocketPath(id), standby || suspended),
        );
      } catch (e) {
        this.workers.delete(worker);
        this.logger.warning(`Error spawning worker ${worker.descr}`, e);
        await sleep(1000);
        continue;
      }

      this.logger.debug(`Successfully spawned worker ${worker.descr}`);
      this.workers.mapPid(worker);

      try {
        this.logger.debug(`Waiting for worker ${worker.descr} to come online...`);
        await worker.online;
        await task?.checkpoint();

        if (!standby) {
          await this.symlinkSocket(worker);
        }
      } catch (e) {
        if (e instanceof PromiseTimedOut) {
          this.logger.warning(`Worker ${worker.descr} failed to come online within the configured timeout`);
        }

        this.workers.demote(worker);
        await worker.terminate();

        if (e instanceof ParallelTaskFailed) {
          return;
        }

        continue;
      }

      break;
    }

    previous && await previous.terminate();
  }

  private async adjustWorkerCount(count: number, orig: number, standby?: boolean): Promise<void> {
    if (!this.running) {
      return;
    }

    const queue: Promise<any>[] = [];

    if (orig > count) {
      for (let i = orig - 1; i >= count; --i) {
        const worker = standby ? this.workers.popStandby() : this.workers.getCurrent(i);

        if (worker) {
          this.workers.demote(worker);
          queue.push(worker.terminate());
        }
      }
    } else {
      const group = new ParallelTaskGroup();

      for (let i = orig; i < count; ++i) {
        queue.push(this.startWorker(standby || i, undefined, this.config.options.maxStartAttempts, group.createTask()));
      }
    }

    queue.length && await Promise.all(queue);
  }

  private async handleWorkerBroken(worker: AbstractWorkerProcess): Promise<void> {
    if (this.running) {
      if (this.workers.isCurrent(worker)) {
        await this.replaceWorker(worker);
      } else if (this.workers.isStandby(worker)) {
        await this.startWorker(true);
      }
    }

    await worker.terminate();
  }

  private async handleWorkerTerminated(worker: AbstractWorkerProcess): Promise<void> {
    const wasCurrent = this.workers.isCurrent(worker);
    const wasStandby = this.workers.isStandby(worker);
    this.workers.delete(worker);

    const socketPath = worker.idx !== undefined && this.formatWorkerSocketPath(worker.idx);
    wasCurrent && socketPath && this.emit('offline', socketPath);

    if (this.running) {
      if (wasCurrent) {
        this.logger.warning(`Worker ${worker.descr} terminated unexpectedly`);
        await this.replaceWorker(worker);
      } else if (wasStandby) {
        this.logger.warning(`Standby ${worker.descr} terminated unexpectedly`);
        await this.startWorker(true);
      }
    } else if (socketPath) {
      this.logger.debug(`Cleaning up socket symlink #${worker.idx}`);
      await this.cleanupSocket(socketPath);
    }

    this.logger.debug(`Cleaning up socket after worker ${worker.descr}`);
    await this.cleanupSocket(this.formatWorkerSocketPath(worker.id));
  }

  private async adoptWorker(
    peer: IpcPeer<any, any>,
    id: string,
    pid: number,
    idxOrStandby?: number | boolean,
  ): Promise<AbstractWorkerProcess> {
    const [pre, post] = idxOrStandby === undefined ? ['Zombie', ' discovered']
      : typeof idxOrStandby === 'boolean' ? ['Adopting standby', ''] : ['Adopting', '']
    this.logger.info(`${pre} worker '${shortId(id)}' (pid: ${pid})${post}`);
    peer.clearAllHandlers();
    const worker = this.createWorker(id, idxOrStandby, true);
    await worker.init(pid, peer);
    return worker;
  }

  private createWorker(id: string, idxOrStandby?: number | boolean, adopted?: false): SpawnedWorkerProcess;
  private createWorker(id: string, idxOrStandby: number | boolean | undefined, adopted: true): AdoptedWorkerProcess;
  private createWorker(id: string, idxOrStandby?: number | boolean, adopted: boolean = false): AbstractWorkerProcess {
    const api: ApplicationMessageApi = {
      sendAppMessage: async ({ message, data, workers }) => this.sendAppMessage(message, data, workers, id),
      sendAppRequest: ({ request, data, workers }) => this.sendAppRequest(request, data, workers, id),
    };

    const worker = adopted
      ? new AdoptedWorkerProcess(id, this.config.options, this.logger, api)
      : new SpawnedWorkerProcess(id, this.config.options, this.logger, api);

    this.workers.add(worker, idxOrStandby);
    worker.on('broken', this.handleWorkerBroken);
    worker.on('terminated', this.handleWorkerTerminated);
    return worker;
  }

  private async replaceWorker(worker: AbstractWorkerProcess & { idx: number }): Promise<void> {
    const standby = this.workers.popStandby();

    if (!standby) {
      return this.startWorker(worker.idx);
    }

    this.workers.setCurrent(worker.idx, standby);
    await standby.online;
    await this.symlinkSocket(standby);
    await standby.resume();
    await this.startWorker(true);
  }

  private async symlinkSocket(worker: AbstractWorkerProcess): Promise<void> {
    if (worker.idx === undefined) {
      return;
    }

    this.logger.debug(`Symlinking socket for worker ${worker.descr}`);
    const socketPath = this.formatWorkerSocketPath(worker.idx);
    const actualPath = this.formatWorkerSocketPath(worker.id);
    const tmpPath = `${socketPath}.new`;
    await symlink(actualPath, tmpPath);
    await rename(tmpPath, socketPath);
    this.emit('online', socketPath);
  }

  private async cleanupSocket(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch { /* noop */ }
  }

  private formatWorkerSocketPath(worker: number | string): string {
    return this.config.socketFile.replace('{worker}', worker.toString());
  }
}
