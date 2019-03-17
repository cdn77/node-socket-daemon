import { createConnection } from 'net';
import { Options } from '../config';

class Client {
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  async send(command: string, ...args: string[]): Promise<void> {
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

export async function sendAction(options: Options, action: string): Promise<void> {
  const client = new Client(options);
  await client.send(action);
}
