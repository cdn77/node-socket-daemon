import { ConsoleHandler } from '@debugr/console';
import { Logger, LogLevel } from '@debugr/core';
import {
  Config,
  DaemonStatus,
  DaemonUpgradeReply,
  getNodesockdVersion,
  loadConfig,
} from '../common';
import { IpcPeer, UnixSocketIpcServer, UnixSocketIpcTransport } from '../ipc';
import { sleep } from '../utils';
import { DevServer } from './devServer';
import { ProcessManager } from './processManager';
import { DaemonIpcIncomingMap } from './types';

export class Daemon {
  private readonly configPath: string;
  private config: Config;
  private readonly logger: Logger;
  private readonly ipc: UnixSocketIpcServer;
  private readonly pm: ProcessManager;
  private readonly devServer?: DevServer;
  private readonly version: string;
  private readonly startTs: number;

  constructor(configPath: string, config: Config, devServerPort?: number) {
    this.configPath = configPath;
    this.config = config;
    this.logger = new Logger({
      globalContext: {},
      plugins: [
        new ConsoleHandler({
          threshold: config.debug ? LogLevel.DEBUG : LogLevel.INFO,
          timestamp: true,
        }),
      ],
    });
    this.ipc = new UnixSocketIpcServer(config.ipcFile);
    this.pm = new ProcessManager(this.logger, config);
    this.version = getNodesockdVersion();
    this.startTs = Date.now();
    devServerPort && (this.devServer = new DevServer(devServerPort));
    this.handleSignal = this.handleSignal.bind(this);
    this.handleIpcConnection = this.handleIpcConnection.bind(this);
  }

  async run(): Promise<void> {
    this.logger.warning('Daemon starting...');

    process.title = `${this.config.name} daemon`;
    process.on('SIGTERM', this.handleSignal);
    process.on('SIGINT', this.handleSignal);

    this.ipc.on('connection', this.handleIpcConnection);
    await this.ipc.start();

    if (this.devServer) {
      this.logger.warning('Dev server starting...');
      await this.devServer.start();
      this.logger.warning(`Dev server is listening on port ${this.devServer.port}`);

      this.pm.on('online', (socketPath) => this.devServer?.addWorkerSocket(socketPath));
      this.pm.on('offline', (socketPath) => this.devServer?.removeWorkerSocket(socketPath));
    }

    await this.pm.run();

    this.logger.warning('Daemon running');
  }

  getStatus(): DaemonStatus {
    return {
      pid: process.pid,
      version: this.version,
      startTs: this.startTs,
      workers: this.pm.getStates(),
    };
  }

  async reloadConfig(): Promise<void> {
    this.logger.info('Reloading daemon config...');
    const [config] = await loadConfig('/', this.configPath);
    this.config = config;
    process.title = `${config.name} daemon`;
    await this.pm.setConfig(config);
    this.logger.info('Daemon config reloaded successfully');
  }

  async upgrade(version: string): Promise<DaemonUpgradeReply> {
    if (version === this.version) {
      return {
        upgrading: false,
        pid: process.pid,
      };
    } else {
      this.logger.warning(`Upgrading daemon to version ${version}...`);
      sleep(500).then(() => this.terminate(true));

      return {
        upgrading: true,
        pid: process.pid,
      };
    }
  }

  async terminate(detach: boolean = false): Promise<void> {
    this.logger.warning('Daemon terminating...');
    process.off('SIGTERM', this.handleSignal);
    process.off('SIGINT', this.handleSignal);

    await this.pm.stop(detach);
    await this.ipc.close();
    await this.devServer?.close();
  }

  private async handleSignal(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
    await this.terminate();
    process.kill(process.pid, signal);
  }

  private async handleIpcConnection(socket: UnixSocketIpcTransport): Promise<void> {
    const peer = new IpcPeer<{}, DaemonIpcIncomingMap>(socket);

    peer.setRequestHandler('status', async () => this.getStatus());

    peer.setMessageHandler('online', async (data) => this.pm.handleOnline(peer, data));
    peer.setMessageHandler('broken', async (data) => this.pm.handleBroken(peer, data));
    peer.setRequestHandler('start-workers', async ({ suspended }) => this.pm.start(suspended));
    peer.setRequestHandler('restart-workers', async ({ suspended }) => this.pm.restart(suspended));
    peer.setRequestHandler('resume-workers', async () => this.pm.resume());
    peer.setRequestHandler('stop-workers', async () => this.pm.stop());
    peer.setRequestHandler('set-worker-count', async ({ count }) => this.pm.setWorkerCount(count));
    peer.setRequestHandler('set-standby-count', async ({ count }) => this.pm.setStandbyCount(count));

    peer.setRequestHandler('send-app-msg', async ({ message, data, workers }) => {
      await this.pm.sendAppMessage(message, data, workers);
    });
    peer.setRequestHandler('send-app-req', async ({ request, data, workers }) => {
      return this.pm.sendAppRequest(request, data, workers);
    });

    peer.setRequestHandler('upgrade', async ({ version }) => this.upgrade(version));
    peer.setRequestHandler('terminate', async () => {
      sleep(500).then(() => this.terminate());
      return { pid: process.pid };
    });

    await peer.run();
  }
}
