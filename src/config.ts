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
  env?: string[];
};

type CliOptions = Partial<Config> & { config?: string };

export type Options = {
  configPath: string | null;
  scriptPath: string;
  listenVar: string;
  ipcPath: string;
  socketPathPattern: string;
  workers: number;
  env: string[];
};

const readFile = promisify(fs.readFile);

export async function loadConfig(cmd: Command): Promise<Options> {
  const opts: CliOptions = cmd.opts();
  const configPath = opts.config ? path.resolve(process.cwd(), opts.config) : null;
  const config: Config = configPath ? JSON.parse(await readFile(configPath, 'utf-8')) : {};
  const basePath = configPath ? path.dirname(configPath) : process.cwd();
  const tmpDir = opts.tmpDir || config.tmpDir || '.';

  if (!opts.script && !config.script) {
    throw new Error('Missing either --script or the "script" config key');
  }

  return {
    configPath,
    scriptPath: path.resolve(basePath, opts.script || config.script),
    listenVar: opts.listenVar || config.listenVar || 'LISTEN_ON',
    ipcPath: path.resolve(basePath, tmpDir, opts.ipcFile || config.ipcFile || 'nodesockd.ipc'),
    socketPathPattern: path.resolve(
      basePath,
      tmpDir,
      opts.socketFile || config.socketFile || 'app.{worker}.sock',
    ),
    workers: opts.workers || config.workers || 1,
    env: opts.env || config.env || [],
  };
}
