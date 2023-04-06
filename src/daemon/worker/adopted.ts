import { isPidAlive } from '../utils';
import { AbstractWorkerProcess, WorkerIpcPeer } from './abstract';

export class AdoptedWorkerProcess extends AbstractWorkerProcess {
  private _monitor?: NodeJS.Timeout;

  async init(pid: number, ipc: WorkerIpcPeer): Promise<void> {
    await super.init(pid, ipc);
    this._monitor = setInterval(this.monitor.bind(this), 250);
    this._online.resolve();
  }

  protected detached() {
    clearInterval(this._monitor);
    this._monitor = undefined;
  }

  protected async terminated(): Promise<void> {
    this.detached();
    await super.terminated();
  }

  private async monitor(): Promise<void> {
    if (this.status.pid === undefined) {
      return;
    }

    if (!isPidAlive(this.status.pid)) {
      await this.terminated();
    }
  }
}
