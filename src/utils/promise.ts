export type PromiseApi<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  abort: () => void;
  setTimeout: (t?: number) => void;
  timeout: () => void;
  promise: Promise<T>;
  stack?: string;
};

export class PromiseAborted extends Error {}
export class PromiseTimedOut extends Error {
  constructor(stack?: string) {
    super();
    stack && (this.stack = stack);
  }
}

export function createPromise<T>(timeout?: number): PromiseApi<T> {
  const api: PromiseApi<T> = {} as any;
  Error.captureStackTrace(api);

  api.promise = new Promise((resolve, reject) => {
    let tmr: NodeJS.Timeout | undefined;

    api.resolve = (value: T | PromiseLike<T>): void => {
      clearTimeout(tmr);
      resolve(value);
    };

    api.reject = (reason?: any): void => {
      clearTimeout(tmr);
      reject(reason);
    };

    api.abort = () => api.reject(new PromiseAborted());
    api.timeout = () => api.reject(new PromiseTimedOut(api.stack));
    api.setTimeout = (t) => {
      t ??= timeout;
      clearTimeout(tmr);
      t !== undefined && (tmr = setTimeout(api.timeout, t));
    };

    api.setTimeout();
  });

  return api;
}

export async function sleep(t: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, t));
}
