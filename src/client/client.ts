import {
  DaemonApplicationRequestReply,
  DaemonStatus,
  DaemonUpgradeReply,
  getNodesockdVersion,
} from '../common';
import { IpcPeer, JsonObject, UnixSocketIpcTransport } from '../ipc';
import { ClientIpcOutgoingMap } from './types';

export class NodesockdClient {
  protected readonly ipc: IpcPeer<ClientIpcOutgoingMap>;

  constructor(ipcPath: string) {
    this.ipc = new IpcPeer(new UnixSocketIpcTransport(ipcPath));
  }

  async run(): Promise<void> {
    await this.ipc.run();
  }

  async terminate(): Promise<void> {
    await this.ipc.terminate();
  }

  async getStatus(): Promise<DaemonStatus> {
    return this.ipc.sendRequest('status');
  }

  async startWorkers(suspended?: boolean): Promise<void> {
    await this.ipc.sendRequest('start-workers', { suspended });
  }

  async restartWorkers(suspended?: boolean): Promise<void> {
    await this.ipc.sendRequest('restart-workers', { suspended });
  }

  async resumeWorkers(): Promise<void> {
    await this.ipc.sendRequest('resume-workers');
  }

  async stopWorkers(): Promise<void> {
    await this.ipc.sendRequest('stop-workers');
  }

  async setWorkerCount(count: number): Promise<void> {
    await this.ipc.sendRequest('set-worker-count', { count });
  }

  async setStandbyCount(count: number): Promise<void> {
    await this.ipc.sendRequest('set-standby-count', { count });
  }

  async sendAppMessage(message: string, data?: JsonObject, workers?: string): Promise<void> {
    await this.ipc.sendRequest('send-app-msg', { message, data, workers });
  }

  async * sendAppRequest(request: string, data?: JsonObject, workers?: string): AsyncIterableIterator<DaemonApplicationRequestReply> {
    yield * await this.ipc.sendRequest('send-app-req', { request, data, workers });
  }

  async reloadConfig(): Promise<void> {
    await this.ipc.sendRequest('reload');
  }

  async upgradeDaemon(): Promise<DaemonUpgradeReply> {
    return this.ipc.sendRequest('upgrade', { version: getNodesockdVersion() });
  }

  async terminateDaemon(): Promise<number> {
    const { pid } = await this.ipc.sendRequest('terminate');
    return pid;
  }
}
