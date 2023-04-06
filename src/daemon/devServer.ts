import { Server, Socket } from 'net';
import { createPromise } from '../utils';

export class DevServer {
  readonly port: number;
  private readonly server: Server;
  private readonly socketPaths: string[] = [];
  private currentSocket: number = -1;

  constructor(port: number) {
    this.port = port;
    this.server = new Server();
    this.handleConnection = this.handleConnection.bind(this);
  }

  async start(): Promise<void> {
    const start = createPromise<void>();
    this.server.on('listening', start.resolve);
    this.server.on('error', start.reject);

    try {
      this.server.listen(this.port);
      await start.promise;
    } finally {
      this.server.off('listening', start.resolve);
      this.server.off('error', start.reject);
    }

    this.server.on('connection', this.handleConnection);
  }

  async close(): Promise<void> {
    const closed = createPromise<void>();
    this.server.close((err) => err ? closed.reject(err) : closed.resolve());
    await closed.promise;
  }

  addWorkerSocket(socketPath: string): void {
    if (!this.socketPaths.includes(socketPath)) {
      this.socketPaths.push(socketPath);
    }
  }

  removeWorkerSocket(socketPath: string): void {
    const idx = this.socketPaths.indexOf(socketPath);
    idx > -1 && this.socketPaths.splice(idx, 1);
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const conn = await this.connect();
    socket.pipe(conn);
    conn.pipe(socket);
  }

  private async connect(): Promise<Socket> {
    const connected = createPromise<void>();
    const sock = new Socket();
    sock.on('connect', connected.resolve);
    sock.on('error', connected.reject);

    try {
      sock.connect({ path: this.getNextSocket() });
      await connected.promise;
    } finally {
      sock.off('connect', connected.resolve);
      sock.off('error', connected.reject);
    }

    return sock;
  }

  private getNextSocket(): string {
    if (!this.socketPaths.length) {
      throw new Error('No worker is running');
    }

    if (++this.currentSocket >= this.socketPaths.length) {
      this.currentSocket = 0;
    }

    return this.socketPaths[this.currentSocket];
  }
}
