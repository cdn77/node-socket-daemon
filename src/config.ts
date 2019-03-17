import { Command } from 'commander';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

export type Config = {
  script: string;
  tmpDir: string;
  socketFile: string;
  listenVar?: string;
  ipcFile?: string;
  workers?: number;
};

export type Options = {
  configPath: string | null;
  scriptPath: string;
  listenVar: string;
  ipcPath: string;
  socketPathPattern: string;
  workers: number;
};

const readFile = promisify(fs.readFile);

export async function loadConfig(cmd: Command): Promise<Options> {
  const configPath = cmd.config ? path.resolve(process.cwd(), cmd.config) : null;
  const config: Config = configPath ? JSON.parse(await readFile(configPath, 'utf-8')) : {};
  const basePath = configPath ? path.dirname(configPath) : process.cwd();
  const tmpDir = cmd.tmpDir || config.tmpDir || '.';

  return {
    configPath,
    scriptPath: path.resolve(basePath, cmd.script || config.script),
    listenVar: cmd.listenVar || config.listenVar || 'LISTEN_ON',
    ipcPath: path.resolve(basePath, tmpDir, cmd.ipcFile || config.ipcFile || 'nodesockd.ipc'),
    socketPathPattern: path.resolve(
      basePath,
      tmpDir,
      cmd.socketFile || config.socketFile || 'app.{worker}.sock',
    ),
    workers: cmd.workers || config.workers || 1,
  };
}
