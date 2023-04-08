import { spawn } from 'child_process';
import { open } from 'fs/promises';
import { IpcPeer, NativeIpcTransport } from '../../ipc';
import { createPromise, PromiseApi } from '../../utils';
import { AbstractWorkerProcess, WorkerIpcPeer } from './abstract';

export class SpawnedWorkerProcess extends AbstractWorkerProcess {
  async spawn(script: string, env: Record<string, string | undefined>): Promise<void> {
    if (this.status.pid !== undefined) {
      throw new Error('Cannot spawn worker which is already running');
    }

    const stdout = this.options.stdout ? await open(this.options.stdout, 'a', 0o600) : undefined;
    const stderr = this.options.stderr === undefined ? stdout
      : this.options.stderr !== null ? await open(this.options.stderr, 'a', 0o600)
      : undefined

    const startup: PromiseApi<number> = createPromise(this.options.spawnTimeout);
    const worker = spawn(process.execPath, [script], {
      env,
      stdio: ['ignore', stdout?.fd ?? 'ignore', stderr?.fd ?? 'ignore', 'ipc'],
      detached: true,
    });

    const handleSpawned = async () => {
      if (worker.pid !== undefined) {
        cleanup();
        worker.on('exit', this.terminated);
        this._online.setTimeout(this.options.onlineTimeout);
        startup.resolve(worker.pid);
      } else {
        await handleError(new Error('Unable to determine PID of spawned worker process'));
      }
    };

    const handleError = async (err: Error) => {
      cleanup();
      await this.terminated();
      startup.reject(err);
    };

    const cleanup = () => {
      worker.off('spawn', handleSpawned);
      worker.off('error', handleError);
      worker.unref();
      stdout?.close();
      stderr && stderr !== stdout && stderr.close();
    };

    worker.on('spawn', handleSpawned);
    worker.on('error', handleError);
    const pid = await startup.promise;
    const ipc: WorkerIpcPeer = new IpcPeer(new NativeIpcTransport(worker));
    await this.init(pid, ipc);
  }
}
