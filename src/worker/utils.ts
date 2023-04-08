export type NodesockdWorkerOptions = {
  id?: string;
  name?: string;
  suspended: boolean;
  socketPath?: string;
};

export function getOptionsFromEnv(): NodesockdWorkerOptions {
  const id = getEnv('WORKER_ID');
  const name = getEnv('APP_NAME');
  const suspended = getEnv('SUSPENDED', (v) => v === 'true') ?? false;
  const socketPath = getEnv('SOCKET_PATH');

  return {
    id,
    name,
    suspended,
    socketPath,
  };
}

function getEnv<R = string>(name: string, xform?: (value: string) => R): R | undefined {
  const value = process.env[`NODESOCKD_${name}`];
  return !xform || value === undefined ? value : xform(value) as any;
}
