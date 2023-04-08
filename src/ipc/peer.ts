import { v4 } from 'uuid';
import { AsyncQueue, createPromise, PromiseApi } from '../utils';
import { IpcTransport, JsonObject, JsonSerializable } from './transport';
import {
  AnyIpcHandler,
  AnyIpcReply,
  IpcMessageMap,
  IpcRequestError,
  isAsyncIterable,
  isMessage,
  isReply,
  isRequest,
  Reply,
} from './types';

type MessageType<Map extends IpcMessageMap> = string & keyof {
  [K in keyof Map as Map[K] extends [any, void] ? K : never]: Map[K];
};

type RequestType<Map extends IpcMessageMap> = string & keyof {
  [K in keyof Map as Map[K] extends [any, void] ? never : K]: Map[K];
};

type ReplyHandler = (msg: AnyIpcReply) => void;

export class IpcPeer<Out extends IpcMessageMap, In extends IpcMessageMap = {}> {
  private readonly transport: IpcTransport;
  private readonly handlers: Map<string, AnyIpcHandler> = new Map();
  private readonly pendingRequests: Map<string, ReplyHandler> = new Map();
  private started: boolean = false;

  constructor(transport: IpcTransport) {
    this.transport = transport;
    this.handleMessage = this.handleMessage.bind(this);
    this.handleTransportClosed = this.handleTransportClosed.bind(this);
  }

  async run(): Promise<void> {
    if (this.started) {
      return;
    }

    this.transport.on('message', this.handleMessage);
    this.transport.on('close', this.handleTransportClosed);

    try {
      this.started = true;
      this.transport.open && await this.transport.open();
    } catch (e) {
      this.started = false;
      throw e;
    }
  }

  async terminate(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.transport.close && await this.transport.close();
    this.started = false;
  }

  async sendMessage<T extends MessageType<Out>>(
    type: T,
    data?: Out[T][0],
  ): Promise<void> {
    await this.send({ type, data });
  }

  async sendRequest<T extends RequestType<Out>>(
    type: T,
    data?: Out[T][0],
  ): Promise<Out[T][1]> {
    const request = createPromise<Reply>(30000);
    const id = v4();

    this.pendingRequests.set(id, this.receiveFirstReply.bind(this, request));
    await this.send({ type, id, data });

    return request.promise;
  }

  clearAllHandlers(): void {
    this.handlers.clear();
  }

  setMessageHandler<T extends MessageType<In>>(
    type: T,
    handler: (data: In[T][0]) => Promise<void> | void,
  ): void {
    this.handlers.set(type, handler);
  }

  setRequestHandler<T extends RequestType<In>>(
    type: T,
    handler: (data: In[T][0]) => Promise<In[T][1]> | In[T][1],
  ): void {
    this.handlers.set(type, handler);
  }

  protected async send(payload: JsonSerializable): Promise<void> {
    this.started || await this.run();
    await this.transport.send(payload);
  }

  private async handleTransportClosed(): Promise<void> {
    await this.terminate();
  }

  protected async handleMessage(payload: JsonSerializable): Promise<void> {
    if (!isMessage(payload)) {
      return;
    }

    if (isReply(payload)) {
      return this.handleIpcReply(payload);
    } else if (!isRequest(payload)) {
      return this.handleIpcMessage(payload.type, payload.data);
    }

    try {
      const result = await this.handleIpcRequest(payload.type, payload.data);

      if (isAsyncIterable(result)) {
        for await (const reply of result) {
          await this.send({
            type: 'reply',
            requestId: payload.id,
            data: reply,
          });
        }

        await this.send({ type: 'reply', requestId: payload.id, done: true });
      } else {
        await this.send({ type: 'reply', requestId: payload.id, done: true, data: result as any });
      }
    } catch (e) {
      await this.send({
        type: 'reply',
        requestId: payload.id,
        errors: e instanceof IpcRequestError ? e.errors : [e.message],
      });
    }
  }

  protected async handleIpcRequest(type: string, data?: JsonObject): Promise<Reply | void> {
    const handler = this.handlers.get(type);

    if (!handler) {
      throw new Error(`Unknown IPC request type '${type}'`);
    }

    return handler(data);
  }

  protected async handleIpcMessage(type: string, data?: JsonObject): Promise<void> {
    const handler = this.handlers.get(type);

    if (!handler) {
      throw new Error(`Unknown IPC message type '${type}'`);
    }

    await handler(data);
  }

  private handleIpcReply(msg: AnyIpcReply): void {
    const handler = this.pendingRequests.get(msg.requestId);
    handler && handler(msg);
  }

  private receiveFirstReply(request: PromiseApi<Reply>, msg: AnyIpcReply): void {
    this.pendingRequests.delete(msg.requestId);

    if (msg.errors) {
      request.reject(new IpcRequestError(msg.errors));
    } else {
      request.resolve(!msg.done ? this.receiveStreamReply(msg) : msg.data);
    }
  }

  private async * receiveStreamReply(firstReply: AnyIpcReply): AsyncIterableIterator<any> {
    const queue = new AsyncQueue<any>(10000);

    this.pendingRequests.set(firstReply.requestId, (msg) => {
      if (msg.errors) {
        queue.throw(new IpcRequestError(msg.errors));
      } else if (msg.data !== undefined) {
        queue.push(msg.data, msg.done);
      } else if (msg.done) {
        queue.done();
      }
    });

    firstReply.data !== undefined && queue.push(firstReply.data);

    try {
      for await (const reply of queue) {
        yield reply;
      }
    } finally {
      this.pendingRequests.delete(firstReply.requestId);
    }
  }
}
