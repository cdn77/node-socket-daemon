let suspended: Promise<void>;
let resolve: () => any;

if (process.send) {
  suspended = new Promise(r => (resolve = r));
}

export function resume(): void {
  resolve && resolve();
}

export async function suspend(): Promise<void> {
  if (suspended) {
    await suspended;
  }
}

export async function suspendExpress(req: any, res: any, next: () => any): Promise<void> {
  await suspend();
  next();
}
