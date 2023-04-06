import { JsonObject, JsonSerializable } from './transport';

export interface IpcMessage<Type extends string = string, Data extends JsonObject = never> {
  type: Type;
  data?: Data;
}

export interface IpcRequest<
  Type extends string = string,
  Data extends JsonObject = never,
> extends IpcMessage<Type, Data> {
  id: string;
}

export interface IpcReply<Data extends JsonObject = never> extends IpcMessage<'reply', Data> {
  requestId: string;
  errors?: string[];
  done?: boolean;
}

export class IpcRequestError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super();
    this.errors = errors;
  }
}

export type IpcHandler<
  D extends JsonSerializable | undefined = undefined,
  R extends Reply<any> | void = Reply<any>,
> = (data: D) => Promise<R> | R;

export type AnyIpcMessage = IpcMessage<any, any>;
export type AnyIpcRequest = IpcRequest<any, any>;
export type AnyIpcReply = IpcReply<any>;
export type AnyIpcHandler = IpcHandler<any, any>;
export type Reply<T extends JsonSerializable = JsonSerializable>
  = AsyncIterableIterator<T> | T | undefined;

export interface IpcMessageMap {
  [type: string]: [data?: JsonObject, reply?: Reply | void];
}

export function isObject(value: unknown): value is object {
  return !!value && typeof value === 'object';
}

export function isMessage(value: unknown): value is AnyIpcMessage {
  return isObject(value) && 'type' in value && typeof value.type === 'string';
}

export function isReply(message: AnyIpcMessage): message is AnyIpcReply {
  return message.type === 'reply' && 'requestId' in message && typeof message.requestId === 'string';
}

export function isRequest(message: AnyIpcMessage): message is AnyIpcRequest {
  return 'id' in message && typeof message.id === 'string';
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<any> {
  return isObject(value) && 'next' in value && typeof value.next === 'function';
}

export async function * ensureIterable<T extends JsonObject>(
  value: AsyncIterableIterator<T> | T | undefined,
): AsyncIterableIterator<T> {
  if (isAsyncIterable(value)) {
    yield * value;
  } else if (value !== undefined) {
    yield value;
  }
}
