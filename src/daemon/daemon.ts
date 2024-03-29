import { ConsoleHandler } from '@debugr/console';
import { Logger, LogLevel } from '@debugr/core';
import { ZodError } from 'zod';
import {
  Config,
  DaemonConfig,
  DaemonStatus,
  getNodesockdVersion,
  loadConfig,
  WorkerRestartReply,
} from '../common';
import { IpcPeer, UnixSocketIpcServer, UnixSocketIpcTransport } from '../ipc';
import { PromiseAborted, sleep } from '../utils';
import { DevServer } from './devServer';
import { ApplyConfigCb, ProcessManager } from './processManager';
import { DaemonIpcIncomingMap } from './types';
import { lte as isCurrentVersion } from 'semver';

export class Daemon {
  private config: Config;
  private configFiles: string[];
  private readonly logger: Logger;
  private readonly ipc: UnixSocketIpcServer;
  private readonly pm: ProcessManager;
  private readonly devServer?: DevServer;
  private readonly version: string;
  private readonly startTs: number;
  private terminating: boolean = false;

  constructor(config: Config, configFiles: string[], devServer?: number | boolean) {
    this.config = config;
    this.configFiles = configFiles;
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

    if (devServer !== false && (devServer !== undefined || this.config.devServer !== false)) {
      const devServerPort =
        typeof devServer === 'number' ? devServer
          : typeof this.config.devServer === 'number' ? this.config.devServer
          : 8000;

      this.devServer = new DevServer(devServerPort);
    }

    this.handleSignal = this.handleSignal.bind(this);
    this.handleIpcConnection = this.handleIpcConnection.bind(this);
    this.handleUncaughtError = this.handleUncaughtError.bind(this);
  }

  async run(): Promise<void> {
    try {
      await this.start();
    } catch (e) {
      await this.handleUncaughtError(e);
    }
  }

  private async start(): Promise<void> {
    this.logger.warning('Daemon starting...');

    process.title = `${this.config.name} daemon`;
    process.on('SIGTERM', this.handleSignal);
    process.on('SIGINT', this.handleSignal);
    process.on('SIGHUP', this.handleSignal);
    process.on('uncaughtException', this.handleUncaughtError);
    process.on('unhandledRejection', this.handleUncaughtError);
    process.umask(0o007);

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

  getConfig(): DaemonConfig {
    return {
      config: this.config,
      files: this.configFiles,
    };
  }

  async reloadConfig(catchErrors: boolean = false, cb?: ApplyConfigCb): Promise<void> {
    this.logger.info('Reloading daemon config...');

    try {
      const [config, configFiles] = await loadConfig('/', this.configFiles[0]);

      await this.pm.setConfig(config, cb);

      [this.config, this.configFiles] = [config, configFiles];
      process.title = `${this.config.name} daemon`;

      this.logger.info('Daemon config reloaded successfully');
    } catch (e) {
      if (!catchErrors) {
        throw e;
      }

      if (!(e instanceof ZodError) || e.errors.length < 2) {
        this.logger.error(`Failed to reload config file: ${e.message}`);
      } else {
        this.logger.error('Failed to reload config file');

        for (const err of e.errors) {
          this.logger.error(`${err.path}: ${err.message}`);
        }
      }
    }
  }

  async terminate(detach: boolean = false): Promise<void> {
    if (this.terminating) {
      return;
    }

    this.logger.warning('Daemon terminating...');
    process.off('SIGTERM', this.handleSignal);
    process.off('SIGINT', this.handleSignal);
    process.off('SIGHUP', this.handleSignal);
    this.terminating = true;

    await this.pm.stop(detach);
    await this.ipc.close();
    await this.devServer?.close();
  }

  private async handleRestart(suspended?: boolean, maxAttempts?: number, version?: string): Promise<WorkerRestartReply> {
    if (version === undefined || isCurrentVersion(version, this.version)) {
      if (version !== undefined) {
        // upgrade requested, but already on latest version -> make sure we reload configuration:
        await this.reloadConfig(false, async () => this.pm.restart(suspended, maxAttempts));
      } else {
        await this.pm.restart(suspended, maxAttempts);
      }

      return { pid: process.pid };
    } else {
      this.logger.warning(`Upgrading daemon to version ${version}...`);
      sleep(500).then(() => this.terminate(true));

      return {
        upgrading: true,
        pid: process.pid,
      };
    }
  }

  private async handleSignal(signal: 'SIGTERM' | 'SIGINT' | 'SIGHUP'): Promise<void> {
    if (signal === 'SIGHUP') {
      return this.reloadConfig(true);
    }

    await this.terminate();
    process.kill(process.pid, signal);
  }

  private async handleIpcConnection(socket: UnixSocketIpcTransport): Promise<void> {
    const peer = new IpcPeer<{}, DaemonIpcIncomingMap>(socket);

    peer.setRequestHandler('status', async () => this.getStatus());
    peer.setRequestHandler('config', async () => this.getConfig());
    peer.setMessageHandler('online', async (data) => this.pm.handleOnline(peer, data));
    peer.setMessageHandler('broken', async (data) => this.pm.handleBroken(peer, data));
    peer.setRequestHandler('start-workers', async ({ suspended, maxAttempts }) => {
      return this.pm.start(suspended, maxAttempts);
    });
    peer.setRequestHandler('restart-workers', async ({ suspended, maxAttempts, version }) => {
      return this.handleRestart(suspended, maxAttempts, version)
    });
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

    peer.setRequestHandler('reload', async () => this.reloadConfig());
    peer.setRequestHandler('terminate', async () => {
      sleep(500).then(() => this.terminate());
      return { pid: process.pid };
    });

    await peer.run();
  }

  private async handleUncaughtError(err: unknown): Promise<void> {
    if (this.terminating && err instanceof PromiseAborted) {
      return;
    } else if (err instanceof Error) {
      this.logger.fatal('Uncaught application error', err);
    } else {
      this.logger.fatal('Uncaught application error', { error: err });
    }

    await this.terminate();
    process.exit(1);
  }
}
