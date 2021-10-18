import * as fs from 'fs';
import { promisify } from 'util';
import { WorkerProcess } from './workerProcess';

const unlink = promisify(fs.unlink);
const symlink = promisify(fs.symlink);
const rename = promisify(fs.rename);

export class Worker {
  private readonly workerId: number;

  private readonly cwd: string;

  private readonly scriptPath: string;

  private readonly socketPathPattern: string;

  private readonly listenVar: string;

  private readonly env: string[];

  private readonly outputPrefix?: string;

  private readonly socketPath: string;

  private process: WorkerProcess | undefined;

  private instanceId: number = 0;

  private terminating: boolean = false;

  constructor(
    workerId: number,
    cwd: string,
    scriptPath: string,
    socketPathPattern: string,
    listenVar: string,
    env: string[] = [],
    outputPrefix?: string,
  ) {
    this.workerId = workerId;
    this.cwd = cwd;
    this.scriptPath = scriptPath;
    this.socketPathPattern = socketPathPattern;
    this.listenVar = listenVar;
    this.env = env;
    this.socketPath = this.formatSocketPath();
    this.outputPrefix = outputPrefix;
  }

  async start(suspended: boolean = false): Promise<void> {
    if (this.process) {
      return;
    }

    this.terminating = false;
    this.instanceId += 1;
    const socketPath = this.formatProcessSocketPath(this.instanceId);
    const socketTmpPath = `${socketPath}.new`;

    this.process = new WorkerProcess(
      this.cwd,
      this.scriptPath,
      this.buildEnv(socketPath, suspended),
      (process) => this.handleProcessDown(process),
      this.formatOutputPrefix(this.instanceId),
    );

    try {
      await unlink(socketPath);
    } catch (e) {
      /* noop */
    }

    await this.process.start();
    await symlink(socketPath, socketTmpPath);
    await rename(socketTmpPath, this.socketPath);
  }

  async stop(): Promise<void> {
    this.terminating = true;
    this.process && (await this.process.stop());
  }

  async restart(suspended: boolean = false): Promise<void> {
    const old = this.process;
    this.process = undefined;
    await this.start(suspended);
    old && (await old.stop());
  }

  resume(): void {
    this.send('resume');
  }

  send(message: string): void {
    this.process && this.process.send(message);
  }

  private async handleProcessDown(process: WorkerProcess): Promise<void> {
    if (process === this.process) {
      this.process = undefined;

      if (!this.terminating) {
        await this.start();
      }
    }
  }

  private formatProcessSocketPath(processId: number): string {
    return `${this.formatSocketPath()}.${processId}`;
  }

  private formatSocketPath(): string {
    return this.socketPathPattern.replace(/{worker}/g, this.workerId.toString());
  }

  private buildEnv(socketPath: string, suspended: boolean): Record<string, any> {
    const env: Record<string, any> = {};

    for (const key of this.env) {
      if (key in process.env) {
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

  private formatOutputPrefix(processId: number): string | undefined {
    return this.outputPrefix
      ? this.outputPrefix.replace(/{(worker|instance)}/g, (_, k) =>
          k === 'worker' ? this.workerId.toString() : processId.toString(),
        )
      : undefined;
  }
}
