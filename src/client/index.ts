import { createConnection } from 'net';
import { ClientCliOptions, ClientOptions, processClientOptions } from './options';

export class Client {
  static async processOptions(options: ClientCliOptions): Promise<ClientOptions> {
    return await processClientOptions(options);
  }

  private readonly options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = options;
  }

  async start(suspended: boolean = false): Promise<void> {
    await this.sendCommand('start', suspended && 'suspended');
  }

  async stop(): Promise<void> {
    await this.sendCommand('stop');
  }

  async restart(suspended: boolean = false): Promise<void> {
    await this.sendCommand('restart', suspended && 'suspended');
  }

  async resume(): Promise<void> {
    await this.sendCommand('resume');
  }

  async sendMessage(msg: string): Promise<void> {
    await this.sendCommand('send', msg);
  }

  private async sendCommand(command: string, ...args: any[]): Promise<void> {
    return new Promise<void>(resolve => {
      const ipc = createConnection(this.options.ipcPath);

      ipc.on('connect', () => {
        ipc.write(JSON.stringify([command, ...args]));
      });

      let buffer = '';

      ipc.on('data', msg => {
        buffer += msg.toString();
        const i = buffer.lastIndexOf('\n');

        if (i > -1) {
          console.log(buffer.substring(0, i));
          buffer = buffer.substring(i + 1);
        }
      });

      ipc.on('end', () => {
        if (buffer) {
          console.log(buffer);
        }

        resolve();
      });
    });
  }
}
