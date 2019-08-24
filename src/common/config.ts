import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const readFile = promisify(fs.readFile);

const configOptions = {
  script: 'string',
  tmpDir: 'string',
  socketFile: 'string',
  listenVar: 'string',
  ipcFile: 'string',
  workers: 'number',
  env: (v: any): v is string[] => Array.isArray(v) && !v.some(v => typeof v !== 'string'),
};

type COpts = typeof configOptions;

export type Config = {
  [O in keyof COpts]?: (COpts[O] extends 'string'
    ? string
    : COpts[O] extends 'number'
    ? number
    : COpts[O] extends 'boolean'
    ? boolean
    : COpts[O] extends (v: any) => v is infer T
    ? T
    : never);
};

export function resolveConfigPath(configFile: string | undefined): string | undefined {
  return configFile ? path.resolve(process.cwd(), configFile) : undefined;
}

export function resolveBasePath(configPath: string | undefined): string {
  return configPath ? path.dirname(configPath) : process.cwd();
}

export async function loadConfig(configPath: string | undefined): Promise<Config> {
  if (configPath) {
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    for (const key of Object.keys(config)) {
      if (!(key in configOptions)) {
        throw new TypeError(`Unknown config option '${key}'`);
      } else if (
        typeof configOptions[key] === 'function'
          ? !configOptions[key](config[key])
          : typeof config[key] !== configOptions[key]
      ) {
        throw new TypeError(`Invalid config option '${key}'`);
      }
    }

    return config;
  }

  return {};
}

export function resolveIpcPath(
  basePath: string,
  tmpDir: string | undefined | null,
  ipcFile: string | undefined | null,
): string {
  return path.resolve(basePath, tmpDir || '', ipcFile || 'nodesockd.ipc');
}
