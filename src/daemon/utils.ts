import { Config } from '../common';

export function buildWorkerEnv(
  config: Config,
  workerId: string,
  socketPath: string,
  suspended?: boolean,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};

  for (const key of config.env) {
    if (key in process.env) {
      env[key] = process.env[key];
    }
  }

  return {
    ...env,
    NODE_ENV: process.env.NODE_ENV,
    NODESOCKD_APP_NAME: config.name,
    NODESOCKD_WORKER_ID: workerId,
    NODESOCKD_SUSPENDED: suspended ? 'true' : '',
    NODESOCKD_SOCKET_PATH: socketPath,
  };
}

export type ConfigAction = 'restart' | 'set-workers' | 'set-standby' | 'set-name';

export function compareConfig(current: Config, next: Config): ConfigAction[] {
  if (next.ipcFile !== current.ipcFile || next.tmpDir !== current.tmpDir) {
    throw new Error("Cannot change the 'ipcFile' or 'tmpDir' option in the config file on the fly");
  }

  if (
    next.script !== current.script
    || next.socketFile !== current.socketFile
    || next.env.length !== current.env.length
    || next.env.some((v) => !current.env.includes(v))
    || next.options.stdout !== current.options.stdout
    || next.options.stderr !== current.options.stderr
  ) {
    return ['restart'];
  }

  const actions: ConfigAction[] = [];
  next.name !== current.name && actions.push('set-name');
  next.workers !== current.workers && actions.push('set-workers');
  next.standby !== current.standby && actions.push('set-standby');
  return actions;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
