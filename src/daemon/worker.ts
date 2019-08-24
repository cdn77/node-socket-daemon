import { ChildProcess, fork } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const unlink = promisify(fs.unlink);
const symlink = promisify(fs.symlink);
const rename = promisify(fs.rename);

export type OnExitFn = {
  (instance: WorkerInstance): void | Promise<void>;
};

export class WorkerInstance {
  private readonly scriptPath: string;

  private readonly env: Record<string, any>;

  private readonly onExit: OnExitFn;

  private process: ChildProcess;

  constructor(
    scriptPath: string,
    env: Record<string, any>,
    onExit: OnExitFn,
  ) {
    this.scriptPath = scriptPath;
    this.env = env;
    this.onExit = onExit;
  }

  async start(): Promise<void> {
    return new Promise<void>(resolve => {
      this.process = fork(this.scriptPath, [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: this.env,
      });

      this.process.on('exit', () => {
        this.process.unref();
        this.onExit(this);
      });

      this.process.on('message', message => {
        message === 'online' && resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return await new Promise<void>(resolve => {
      this.process.once('exit', () => resolve());
      this.process.send('shutdown');
    });
  }

  send(message: string): void {
    this.process.send(message);
  }
}

export class Worker {
  private readonly workerId: number;

  private readonly scriptPath: string;

  private readonly socketPathPattern: string;

  private readonly listenVar: string;

  private readonly env: string[];

  private readonly socketPath: string;

  private instance: WorkerInstance | undefined;

  private instanceId: number = 0;

  private terminating: boolean = false;

  constructor(
    workerId: number,
    scriptPath: string,
    socketPathPattern: string,
    listenVar: string,
    env: string[] = [],
  ) {
    this.workerId = workerId;
    this.scriptPath = scriptPath;
    this.socketPathPattern = socketPathPattern;
    this.listenVar = listenVar;
    this.env = env;
    this.socketPath = this.formatSocketPath();
  }

  async start(suspended: boolean = false): Promise<void> {
    if (this.instance) {
      return;
    }

    this.terminating = false;
    this.instanceId += 1;
    const socketPath = this.formatInstanceSocketPath(this.instanceId);
    const socketTmpPath = `${socketPath}.new`;

    this.instance = new WorkerInstance(
      this.scriptPath,
      this.buildEnv(socketPath, suspended),
      instance => this.handleInstanceDown(instance),
    );

    try {
      await unlink(socketPath);
    } catch (e) {
      /* noop */
    }

    await this.instance.start();
    await symlink(socketPath, socketTmpPath);
    await rename(socketTmpPath, this.socketPath);
  }

  async stop(): Promise<void> {
    this.terminating = true;
    this.instance && (await this.instance.stop());
  }

  async restart(suspended: boolean = false): Promise<void> {
    const old = this.instance;
    this.instance = undefined;
    await this.start(suspended);
    old && (await old.stop());
  }

  resume(): void {
    this.send('resume');
  }

  send(message: string): void {
    this.instance && this.instance.send(message);
  }

  private async handleInstanceDown(instance: WorkerInstance): Promise<void> {
    if (instance === this.instance) {
      this.instance = undefined;

      if (!this.terminating) {
        await this.start();
      }
    }
  }

  private formatInstanceSocketPath(instanceId: number): string {
    return `${this.formatSocketPath()}.${instanceId}`;
  }

  private formatSocketPath(): string {
    return this.socketPathPattern.replace(/{worker}/g, this.workerId.toString());
  }

  private buildEnv(socketPath: string, suspended: boolean): Record<string, any> {
    const env: Record<string, any> = {};

    for (const key of this.env) {
      if (process.env.hasOwnProperty(key)) {
        env[key] = process.env[key];
      }
    }

    return {
      ...env,
      NODE_ENV: process.env.NODE_ENV,
      NODESOCKD_WORKER_ID: this.workerId.toString(),
      NODESOCKD_SUSPENDED: suspended ? 'true' : '',
      [this.listenVar]: socketPath,
    };
  }
}
