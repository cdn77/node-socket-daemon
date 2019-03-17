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

  private readonly socketPath: string;

  private readonly listenVar: string;

  private readonly onExit: OnExitFn;

  private process: ChildProcess;

  constructor(scriptPath: string, socketPath: string, listenVar: string, onExit: OnExitFn) {
    this.scriptPath = scriptPath;
    this.socketPath = socketPath;
    this.listenVar = listenVar;
    this.onExit = onExit;
  }

  async start(): Promise<void> {
    try {
      await unlink(this.socketPath);
    } catch (e) {
      /* noop */
    }

    return new Promise<void>(resolve => {
      this.process = fork(this.scriptPath, [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
          NODE_ENV: process.env.NODE_ENV,
          [this.listenVar]: this.socketPath,
        },
      });

      this.process.on('exit', () => this.onExit(this));

      this.process.on('message', message => {
        message === 'online' && resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise<void>(resolve => {
      this.process.once('exit', () => {
        this.process.unref();
        resolve();
      });

      this.process.send('shutdown');
    });
  }
}

export class Worker {
  private readonly workerId: number;

  private readonly scriptPath: string;

  private readonly socketPathPattern: string;

  private readonly listenVar: string;

  private readonly socketPath: string;

  private instance: WorkerInstance | undefined;

  private instanceId: number = 0;

  private terminating: boolean = false;

  constructor(workerId: number, scriptPath: string, socketPathPattern: string, listenVar: string) {
    this.workerId = workerId;
    this.scriptPath = scriptPath;
    this.socketPathPattern = socketPathPattern;
    this.listenVar = listenVar;
    this.socketPath = this.formatSocketPath();
  }

  async start(): Promise<void> {
    if (this.instance) {
      return;
    }

    this.terminating = false;
    this.instanceId += 1;
    const socketPath = this.formatInstanceSocketPath(this.instanceId);
    const socketTmpPath = `${socketPath}.new`;

    this.instance = new WorkerInstance(this.scriptPath, socketPath, this.listenVar, instance =>
      this.handleInstanceDown(instance),
    );

    await this.instance.start();
    await symlink(socketPath, socketTmpPath);
    await rename(socketTmpPath, this.socketPath);
  }

  async stop(): Promise<void> {
    this.terminating = true;
    this.instance && (await this.instance.stop());
  }

  async restart(): Promise<void> {
    const old = this.instance;
    this.instance = undefined;
    await this.start();
    old && (await old.stop());
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
}
