import { ChildProcess, fork } from 'child_process';
import { Readable, Writable } from 'stream';
import { OutputProcessor } from './outputProcessor';

export type OnExitFn = {
  (process: WorkerProcess): void | Promise<void>;
};

export class WorkerProcess {
  private readonly scriptPath: string;

  private readonly env: Record<string, any>;

  private readonly onExit: OnExitFn;

  private readonly outputPrefix?: string;

  private process: ChildProcess;

  constructor(
    scriptPath: string,
    env: Record<string, any>,
    onExit: OnExitFn,
    outputPrefix?: string,
  ) {
    this.scriptPath = scriptPath;
    this.env = env;
    this.onExit = onExit;
    this.outputPrefix = outputPrefix;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.process = fork(this.scriptPath, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: this.env,
      });

      if (this.process.stdout) {
        this.setupPipe(this.process.stdout, process.stdout);
      }

      if (this.process.stderr) {
        this.setupPipe(this.process.stderr, process.stderr);
      }

      this.process.on('exit', () => {
        this.process.unref();
        this.onExit(this);
      });

      this.process.on('message', (message) => {
        message === 'online' && resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.process.once('exit', () => resolve());
      this.process.send('shutdown');
    });
  }

  send(message: string): void {
    this.process.send(message);
  }

  private setupPipe(src: Readable, dst: Writable): void {
    if (this.outputPrefix) {
      src.pipe(new OutputProcessor(this.outputPrefix)).pipe(dst);
    } else {
      src.pipe(dst);
    }
  }
}
