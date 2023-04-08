import {
  DaemonApplicationRequestReply,
  DaemonSendApplicationMessage,
  DaemonSendApplicationRequest,
  DaemonSetWorkerCount,
  DaemonStatus,
  DaemonTerminateReply,
  WorkerStart,
  WorkerRestart,
  WorkerRestartReply,
} from '../common';
import { IpcMessageMap } from '../ipc';

export interface ClientIpcOutgoingMap extends IpcMessageMap {
  connect: [undefined, undefined];
  status: [undefined, DaemonStatus];
  'start-workers': [WorkerStart, undefined];
  'restart-workers': [WorkerRestart, WorkerRestartReply];
  'resume-workers': [undefined, undefined];
  'stop-workers': [undefined, undefined];
  'set-worker-count': [DaemonSetWorkerCount, undefined];
  'set-standby-count': [DaemonSetWorkerCount, undefined];
  'send-app-msg': [DaemonSendApplicationMessage, undefined];
  'send-app-req': [DaemonSendApplicationRequest, AsyncIterableIterator<DaemonApplicationRequestReply>];
  'reload': [undefined, undefined];
  'terminate': [undefined, DaemonTerminateReply];
}
