import { Worker } from './worker';
import { Ipc } from './ipc';
import { DaemonCliOptions, DaemonOptions, processDaemonOptions } from './options';

export class Daemon {
  static async processOptions(options: DaemonCliOptions): Promise<DaemonOptions> {
    return await processDaemonOptions(options);
  }

  private options: DaemonOptions;

  private readonly workers: Worker[];

  private readonly ipc: Ipc;

  constructor(options: DaemonOptions) {
    this.options = options;
    this.workers = this.createWorkers();
    this.ipc = new Ipc(
      this.options.ipcPath,
      async (cmd, args, log) => await this.handleCommand(cmd, args, log),
    );
  }

  async run(): Promise<void> {
    this.setupSignalHandlers();
    await this.ipc.run();
    await this.startWorkers();
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', this.terminate.bind(this));
    process.on('SIGINT', this.terminate.bind(this));
    process.on('SIGHUP', this.restartWorkers.bind(this));
  }

  private createWorkers(): Worker[] {
    return new Array<Worker>(this.options.workers)
      .fill(null as any)
      .map(
        (_, id) =>
          new Worker(
            id,
            this.options.scriptPath,
            this.options.socketPathPattern,
            this.options.listenVar,
            this.options.env,
          ),
      );
  }

  private async handleCommand(
    cmd: string,
    args: string[],
    log: (msg: string) => void,
  ): Promise<void> {
    try {
      switch (cmd) {
        case 'start':
          await this.startWorkers(args[0] === 'suspended');
          break;
        case 'stop':
          await this.stopWorkers();
          break;
        case 'restart':
          await this.restartWorkers(args[0] === 'suspended');
          break;
        case 'resume':
          this.resumeWorkers();
          break;
        case 'send':
          this.sendMessage(args[0]);
          break;
      }
    } catch (e) {
      log(e.toString());
    }
  }

  private async startWorkers(suspended: boolean = false): Promise<void> {
    await Promise.all(this.workers.map(async worker => await worker.start(suspended)));
  }

  private async stopWorkers(): Promise<void> {
    await Promise.all(this.workers.map(async worker => await worker.stop()));
  }

  private async restartWorkers(suspended: boolean = false): Promise<void> {
    await Promise.all(this.workers.map(async worker => await worker.restart(suspended)));
  }

  private resumeWorkers(): void {
    this.sendMessage('resume');
  }

  private sendMessage(message: string): void {
    this.workers.forEach(worker => worker.send(message));
  }

  private async terminate(): Promise<void> {
    await this.stopWorkers();
    await this.ipc.stop();
  }
}
