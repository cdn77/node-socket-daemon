import { ChildProcess, fork } from 'child_process';

export type OnExitFn = {
  (process: WorkerProcess): void | Promise<void>;
};

export class WorkerProcess {
  private readonly scriptPath: string;

  private readonly env: Record<string, any>;

  private readonly onExit: OnExitFn;

  private process: ChildProcess;

  constructor(scriptPath: string, env: Record<string, any>, onExit: OnExitFn) {
    this.scriptPath = scriptPath;
    this.env = env;
    this.onExit = onExit;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.process = fork(this.scriptPath, [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: this.env,
      });

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
}
