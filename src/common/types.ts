import { JsonObject, JsonSerializable } from '../ipc';

export type WorkerOnline = {
  id: string;
  pid: number;
  suspended?: boolean;
};

export type WorkerBroken = {
  id: string;
  pid: number;
  reason?: string;
};

export type ApplicationMessage = {
  message: string;
  data?: JsonObject;
};

export type ApplicationRequest = {
  request: string;
  data?: JsonObject;
};

export type ApplicationRequestReply = {
  pid: number;
  data?: JsonSerializable;
};

export type WorkerStart = {
  suspended?: boolean;
  maxAttempts?: number;
};

export type WorkerRestart = {
  suspended?: boolean;
  maxAttempts?: number;
  version?: string;
};

export type WorkerRestartReply = {
  upgrading?: boolean;
  pid: number;
};

export type WorkerDetach = {
  ipcPath: string;
};

export type WorkerSetName = {
  name: string;
};

export type WorkerState = 'running' | 'online' | 'suspended' | 'broken' | 'terminating' | 'dead';

export type WorkerStatus = {
  id: string;
  idx?: number;
  pid?: number;
  state: WorkerState;
  stateTs: number;
};

export type DaemonStatus = {
  version: string;
  pid: number;
  startTs: number;
  workers: WorkerStatus[];
};

export type DaemonSetWorkerCount = {
  count: number;
};

export type DaemonSendApplicationMessage = {
  message: string;
  data?: JsonObject;
  workers?: string;
};

export type DaemonSendApplicationRequest = {
  request: string;
  data?: JsonObject;
  workers?: string;
};

export type DaemonApplicationRequestReply = {
  id: string;
  pid: number;
  data?: JsonSerializable;
  errors?: string[];
};

export type DaemonTerminateReply = {
  pid: number;
};
