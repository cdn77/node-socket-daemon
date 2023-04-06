import { resolve } from 'path';
import { Config, loadConfig } from './config';
import { resolveCwd } from './utils';

export async function resolveIpcFile(ipcFile?: string, configPath?: string): Promise<string> {
  if (ipcFile) {
    return resolve(await resolveCwd(), ipcFile);
  }

  const [config] = await loadConfig(await resolveCwd(), configPath);
  return config.ipcFile;
}

export async function resolveConfig(configFile?: string): Promise<[config: Config, file: string]> {
  return loadConfig(await resolveCwd(), configFile);
}
