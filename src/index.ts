let promise: Promise<void> | undefined = undefined;
let resolve: (() => any) | undefined = undefined;
let workerId: number | undefined = undefined;

if (process.send) {
  if (process.env.NODESOCKD_SUSPENDED === 'true') {
    promise = new Promise(r => (resolve = r));
    process.on('message', msg => msg === 'resume' && resume());
  }

  if (process.env.NODESOCKD_WORKER_ID !== undefined) {
    workerId = parseInt(process.env.NODESOCKD_WORKER_ID, 10);
  }
}

function resume(): void {
  const r = resolve;
  promise = resolve = undefined;
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

suspend.express = async (req: any, res: any, next: () => any): Promise<void> => {
  await suspend();
  next();
};
