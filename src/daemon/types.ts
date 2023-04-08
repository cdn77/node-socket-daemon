import {
  ApplicationMessage,
  ApplicationRequest,
  ApplicationRequestReply,
  DaemonApplicationRequestReply,
  DaemonSendApplicationMessage,
  DaemonSendApplicationRequest,
  DaemonSetWorkerCount,
  DaemonStatus,
  DaemonTerminateReply,
  WorkerBroken,
  WorkerDetach,
  WorkerOnline,
  WorkerSetName,
  WorkerStart,
  WorkerRestart,
  WorkerRestartReply,
} from '../common';
import { IpcMessageMap } from '../ipc';


export interface WorkerProcessIpcIncomingMap extends IpcMessageMap {
  online: [WorkerOnline, void];
  broken: [WorkerBroken, void];
  'send-app-msg': [DaemonSendApplicationMessage, void];
  'send-app-req': [DaemonSendApplicationRequest, AsyncIterableIterator<DaemonApplicationRequestReply>];
}

export interface WorkerProcessIpcOutgoingMap extends IpcMessageMap {
  resume: [undefined, void];
  'set-name': [WorkerSetName, void];
  detach: [WorkerDetach, void];
  shutdown: [undefined, void];
  'app-msg': [ApplicationMessage, void];
  'app-req': [ApplicationRequest, AsyncIterableIterator<ApplicationRequestReply>];
}

export interface DaemonIpcIncomingMap extends WorkerProcessIpcIncomingMap {
  status: [undefined, DaemonStatus];
  'start-workers': [WorkerStart, void];
  'restart-workers': [WorkerRestart, WorkerRestartReply];
  'resume-workers': [undefined, void];
  'stop-workers': [undefined, void];
  'set-worker-count': [DaemonSetWorkerCount, void];
  'set-standby-count': [DaemonSetWorkerCount, void];
  reload: [undefined, void];
  terminate: [undefined, DaemonTerminateReply];
}

