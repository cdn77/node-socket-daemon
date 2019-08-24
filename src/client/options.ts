import { loadConfig, resolveBasePath, resolveConfigPath, resolveIpcPath } from '../common/config';

export type ClientCliOptions = {
  config?: string;
  ipcFile?: string;
};

export type ClientOptions = {
  ipcPath: string;
};

export async function processClientOptions(options: ClientCliOptions): Promise<ClientOptions> {
  const configPath = resolveConfigPath(options.config);
  const config = await loadConfig(configPath);
  const basePath = resolveBasePath(configPath);

  return {
    ipcPath: resolveIpcPath(basePath, config.tmpDir, options.ipcFile || config.ipcFile),
  };
}
