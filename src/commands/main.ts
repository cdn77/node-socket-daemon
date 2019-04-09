import { Options } from '../config';
import { Worker } from './worker';
import { Ipc } from './ipc';

class MainCommand {
  private options: Options;

  private readonly workers: Worker[];

  private readonly ipc: Ipc;

  constructor(options: Options) {
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
          await this.startWorkers();
          break;
        case 'stop':
          await this.stopWorkers();
          break;
        case 'restart':
          await this.restartWorkers();
          break;
        case 'send':
          this.sendMessage(args[0]);
          break;
      }
    } catch (e) {
      log(e.toString());
    }
  }

  private async startWorkers(): Promise<void> {
    await Promise.all(this.workers.map(async worker => await worker.start()));
  }

  private async stopWorkers(): Promise<void> {
    await Promise.all(this.workers.map(async worker => await worker.stop()));
  }

  private async restartWorkers(): Promise<void> {
    await Promise.all(this.workers.map(async worker => await worker.restart()));
  }

  private sendMessage(message: string): void {
    this.workers.forEach(worker => worker.send(message));
  }

  private async terminate(): Promise<void> {
    await this.stopWorkers();
    await this.ipc.stop();
  }
}

export async function main(options: Options): Promise<void> {
  const main = new MainCommand(options);
  await main.run();
}
