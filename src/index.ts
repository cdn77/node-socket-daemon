let promise: Promise<void> | undefined;
let resolve: (() => any) | undefined;
let workerId: number | undefined;

if (process.send) {
  if (process.env.NODESOCKD_SUSPENDED === 'true') {
    promise = new Promise((r) => (resolve = r));
    process.on('message', (msg) => msg === 'resume' && resume());
  }

  if (process.env.NODESOCKD_WORKER_ID !== undefined) {
    workerId = parseInt(process.env.NODESOCKD_WORKER_ID, 10);
  }
}

function resume(): void {
  const r = resolve;
  promise = undefined;
  resolve = undefined;
  r && r();
}

export async function suspend(): Promise<void> {
  if (promise) {
    await promise;
  }
}

export function isSuspended(): boolean {
  return !!promise;
}

export function getWorkerId(): number | undefined {
  return workerId;
}

export function restart(): boolean {
  if (process.send) {
    process.send('restart');
    return true;
  }

  return false;
}

suspend.express = async (req: any, res: any, next: () => any): Promise<void> => {
  await suspend();
  next();
};
