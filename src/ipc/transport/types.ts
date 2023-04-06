import { EventEmitter, EventMap } from '../../utils';

export interface IpcTransportEvents extends EventMap {
  message: [payload: JsonSerializable];
  close: [];
}

export interface IpcTransport extends EventEmitter<IpcTransportEvents> {
  open?(): Promise<void> | void;
  send(payload: JsonSerializable): Promise<void>;
  close?(): Promise<void> | void;
}

export class IpcConnectError extends Error {}

export type JsonSerializable = string | number | boolean | JsonSerializable[] | JsonObject;

export type JsonObject = {
  [key: string | number]: JsonSerializable | undefined;
};
