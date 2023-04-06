import { createPromise, PromiseAborted, PromiseApi } from './promise';

type QueueItem<T> =
  | { value: T, next: PromiseApi<QueueItem<T>> }
  | { error: any }
  | { done: true };

type NewItem<T> =
  | { value: T }
  | { error: any }
  | { done: true };

export class AsyncQueue<T> {
  private readonly timeout?: number;
  private current: PromiseApi<QueueItem<T>>;
  private last?: PromiseApi<QueueItem<T>>;

  constructor(timeout?: number) {
    this.timeout = timeout;
    this.current = this.last = createPromise(this.timeout);
  }

  push(value: T, done: boolean = false): void {
    this.enqueue({ value });
    done && this.done();
  }

  throw(error?: any): void {
    this.enqueue({ error });
  }

  done(): void {
    this.enqueue({ done: true });
  }

  break(): void {
    this.last = undefined;
    this.current.abort();
  }

  private enqueue(item: NewItem<T>): void {
    if (!this.last) {
      return;
    }

    if ('value' in item) {
      const next = createPromise<QueueItem<T>>(this.timeout);
      this.last.resolve({ ...item, next });
      this.last = next;
    } else {
      this.last.resolve(item);
      this.last = undefined;
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    try {
      while (true) {
        const item = await this.current.promise;

        if ('error' in item) {
          throw item.error;
        } else if ('done' in item) {
          break;
        }

        this.current = item.next;
        yield item.value;
      }
    } catch (e) {
      if (e instanceof PromiseAborted) {
        return;
      } else {
        throw e;
      }
    } finally {
      this.last?.resolve({ done: true });
    }
  }
}


export async function * consumeAsyncResources<T>(resources: AsyncIterable<T>[]): AsyncIterableIterator<T> {
  const queue = new AsyncQueue<T>();
  const pending = new Set(resources);

  resources.map(async (resource) => {
    try {
      for await (const item of resource) {
        queue.push(item);
      }
    } finally {
      pending.delete(resource);

      if (!pending.size) {
        queue.done();
      }
    }
  });

  yield * queue;
}
