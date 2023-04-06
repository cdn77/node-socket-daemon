import { createPromise, EventEmitter } from '../../utils';
import { IpcTransport, IpcTransportEvents, JsonSerializable } from './types';

export interface NativeIpcPeer {
  send(message: JsonSerializable, sendHandle?: any, options?: any, callback?: (error: Error | null) => void): boolean;
  disconnect(): void;
  on(event: 'message', listener: (message: JsonSerializable) => void): this;
  on(event: 'disconnect', listener: () => void): this;
  off(event: 'message', listener: (message: JsonSerializable) => void): this;
  off(event: 'disconnect', listener: () => void): this;
  connected: boolean;
}

export function isChildProcess(process: NodeJS.Process): process is NodeJS.Process & NativeIpcPeer {
  return !!process.send;
}

export class NativeIpcTransport extends EventEmitter<IpcTransportEvents> implements IpcTransport {
  private readonly peer: NativeIpcPeer;
  private closed: boolean = false;

  constructor(peer: NativeIpcPeer) {
    super();
    this.peer = peer;
    this.handleMessage = this.handleMessage.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.peer.on('message', this.handleMessage);
    this.peer.on('disconnect', this.handleDisconnect);
  }

  async send(payload: JsonSerializable): Promise<void> {
    if (!this.peer.connected) {
      throw new Error('Cannot write to IPC transport: IPC channel is closed');
    }

    const sent = createPromise<void>();
    this.peer.send(payload, undefined, undefined, (err) => err ? sent.reject(err) : sent.resolve());
    return sent.promise;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.emit('close');
    this.off();
    this.peer.off('message', this.handleMessage);
    this.peer.off('disconnect', this.handleDisconnect);

    if (!this.peer.connected) {
      return;
    }

    const disconnected = createPromise<void>();
    this.peer.on('disconnect', disconnected.resolve);
    this.peer.disconnect();
    await disconnected.promise;
    this.peer.off('disconnect', disconnected.resolve);
  }

  private handleMessage(message: JsonSerializable): void {
    this.emit('message', message);
  }

  private async handleDisconnect(): Promise<void> {
    await this.close();
  }
}
