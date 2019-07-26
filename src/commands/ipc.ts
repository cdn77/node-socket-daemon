import { createServer, Server } from 'net';
import { promisify } from 'util';
import * as fs from 'fs';

const unlink = promisify(fs.unlink);

export type HandleCommandFn = {
  (cmd: string, args: string[], log: (msg: string) => void): Promise<void>;
};

export class Ipc {
  private readonly socketPath: string;

  private readonly handleCommand: HandleCommandFn;

  private server: Server;

  constructor(socketPath: string, handleCommand: HandleCommandFn) {
    this.socketPath = socketPath;
    this.handleCommand = handleCommand;
  }

  async run(): Promise<void> {
    try {
      await unlink(this.socketPath);
    } catch (e) {
      /* noop */
    }

    this.server = createServer();
    this.server.listen(this.socketPath);

    this.server.on('connection', conn => {
      let buffer = '';

      conn.on('data', async msg => {
        buffer += msg.toString();

        try {
          const [cmd, ...args] = JSON.parse(buffer);
          buffer = '';

          try {
            await this.handleCommand(cmd, args, msg => conn.write(msg));
          } catch (e) {
            conn.write(`Error: ${e}`);
          }

          conn.end();
        } catch (e) {
          /* noop */
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return await new Promise<void>((resolve, reject) =>
        this.server.close(err => (err ? reject(err) : resolve())),
      );
    }
  }
}
