import { Socket } from 'net';
import { createPromise, EventEmitter } from '../../../utils';
import { IpcConnectError, IpcTransport, IpcTransportEvents, JsonSerializable } from '../types';

export class UnixSocketIpcTransport extends EventEmitter<IpcTransportEvents> implements IpcTransport {
  private readonly path?: string;
  private readonly sock: Socket;
  private buffer?: string;
  private closed: boolean = false;
  private ended: boolean = false;

  constructor(socketOrPath: Socket | string) {
    super();

    [this.path, this.sock] = typeof socketOrPath === 'string'
      ? [socketOrPath, new Socket()]
      : [undefined, socketOrPath];

    this.handleData = this.handleData.bind(this);
    this.handleEnd = this.handleEnd.bind(this);
  }

  async open(): Promise<void> {
    if (!this.path) {
      this.sock.on('data', this.handleData);
      this.sock.on('end', this.handleEnd);
      return;
    }

    const connected = createPromise<void>();

    this.sock.on('connect', connected.resolve);
    this.sock.on('error', connected.reject);

    try {
      this.sock.connect({
        path: this.path,
      });

      await connected.promise;

      this.sock.setEncoding('utf-8');
      this.sock.on('data', this.handleData);
      this.sock.on('end', this.handleEnd);
    } catch (e: any) {
      throw new IpcConnectError(e.message ?? e);
    } finally {
      this.sock.off('connect', connected.resolve);
      this.sock.off('error', connected.reject);
    }
  }

  async send(payload: JsonSerializable): Promise<void> {
    if (this.closed) {
      throw new Error('Cannot write to IPC transport: socket is closed');
    }

    const sent = createPromise<void>();
    this.sock.write(this.encodeMessage(payload), (err) => err ? sent.reject(err) : sent.resolve());
    await sent.promise;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.emit('close');
    this.off();
    this.sock.off('data', this.handleData);
    this.sock.off('end', this.handleEnd);

    if (this.ended) {
      return;
    }

    if (this.sock.writableNeedDrain) {
      const drained = createPromise<void>();
      this.sock.once('drain', drained.resolve);
      await drained.promise;
    }

    const closed = createPromise<void>();
    this.sock.end(closed.resolve);
    await closed.promise;
  }

  private handleData(data: Buffer | string): void {
    for (const message of this.decodeMessages(typeof data === 'string' ? data : data.toString('utf-8'))) {
      this.emit('message', message);
    }
  }

  private async handleEnd(): Promise<void> {
    this.ended = true;
    await this.close();
  }

  private encodeMessage(payload: JsonSerializable): string {
    return JSON.stringify(payload) + '\n';
  }

  private * decodeMessages(buffer: string): Iterable<JsonSerializable> {
    if (this.buffer) {
      buffer = `${this.buffer}${buffer}`;
      this.buffer = undefined;
    }

    for (let i = buffer.indexOf('\n'); i > -1; i = buffer.indexOf('\n')) {
      yield JSON.parse(buffer.slice(0, i));

      if (i + 1 >= buffer.length) {
        return;
      }

      buffer = buffer.slice(i + 1);
    }

    this.buffer = buffer;
  }
}
