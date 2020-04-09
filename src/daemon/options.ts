import * as path from 'path';
import { loadConfig, resolveBasePath, resolveConfigPath, resolveIpcPath } from '../common/config';

export type DaemonCliOptions = {
  config?: string;
  script?: string;
  tmpDir?: string;
  socketFile?: string;
  listenVar?: string;
  ipcFile?: string;
  workers?: number;
  env?: string[];
};

export type DaemonOptions = {
  ipcPath: string;
  workers: number;
  scriptPath: string;
  socketPathPattern: string;
  listenVar: string;
  env: string[];
};

export async function processDaemonOptions(options: DaemonCliOptions): Promise<DaemonOptions> {
  const configPath = resolveConfigPath(options.config);
  const config = await loadConfig(configPath);
  const basePath = resolveBasePath(configPath);
  const tmpDir = options.tmpDir || config.tmpDir || '';
  const scriptFile = options.script || config.script;

  if (!scriptFile) {
    throw new TypeError('Missing --script or the "script" config option');
  }

  return {
    scriptPath: path.resolve(basePath, scriptFile),
    listenVar: options.listenVar || config.listenVar || 'LISTEN_ON',
    ipcPath: resolveIpcPath(basePath, tmpDir, options.ipcFile || config.ipcFile),
    socketPathPattern: path.resolve(
      basePath,
      tmpDir,
      options.socketFile || config.socketFile || 'app.{worker}.sock',
    ),
    workers: options.workers || config.workers || 1,
    env: options.env || config.env || [],
  };
}
