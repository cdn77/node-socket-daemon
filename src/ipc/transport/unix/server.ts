import { Server, Socket } from 'net';
import { unlink } from 'fs/promises';
import { createPromise, EventEmitter, EventMap } from '../../../utils';
import { UnixSocketIpcTransport } from './socket';

export interface UnixSocketIpcEvents extends EventMap {
  connection: [socket: UnixSocketIpcTransport];
}

export class UnixSocketIpcServer extends EventEmitter<UnixSocketIpcEvents> {
  private readonly path: string;
  private readonly sock: Server;

  constructor(path: string) {
    super();
    this.path = path;
    this.sock = new Server();
    this.handleConnection = this.handleConnection.bind(this);
  }

  async start(): Promise<void> {
    const started = createPromise<void>();
    this.sock.on('listening', started.resolve);
    this.sock.on('error', started.reject);

    try {
      await unlink(this.path);
    } catch { /* noop */ }

    try {
      this.sock.listen(this.path);
      await started.promise;
      this.sock.on('connection', this.handleConnection);
    } finally {
      this.sock.off('listening', started.resolve);
      this.sock.off('error', started.reject);
    }
  }

  async close(): Promise<void> {
    this.sock.off('connection', this.handleConnection);

    const closed = createPromise<void>();
    this.sock.close((err) => err ? closed.reject(err) : closed.resolve());
    await closed.promise;
  }

  private handleConnection(socket: Socket): void {
    this.emit('connection', new UnixSocketIpcTransport(socket));
  }
}
