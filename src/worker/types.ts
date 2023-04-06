import {
  ApplicationMessage,
  ApplicationRequest,
  ApplicationRequestReply,
  DaemonApplicationRequestReply,
  DaemonSendApplicationMessage,
  DaemonSendApplicationRequest,
  WorkerBroken,
  WorkerDetach,
  WorkerOnline,
  WorkerSetName,
} from '../common';
import { IpcMessageMap } from '../ipc';

export interface WorkerIpcOutgoingMap extends IpcMessageMap {
  online: [WorkerOnline, void];
  broken: [WorkerBroken, void];
  'send-app-msg': [DaemonSendApplicationMessage, void];
  'send-app-req': [DaemonSendApplicationRequest, AsyncIterableIterator<DaemonApplicationRequestReply>];
}

export interface WorkerIpcIncomingMap extends IpcMessageMap {
  'app-msg': [ApplicationMessage, void];
  'app-req': [ApplicationRequest, AsyncIterableIterator<ApplicationRequestReply> | ApplicationRequestReply];
  resume: [undefined, void];
  detach: [WorkerDetach, void];
  shutdown: [undefined, void];
  'set-name': [WorkerSetName, void];
}
