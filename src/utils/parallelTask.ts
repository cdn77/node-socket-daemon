import { createPromise } from './promise';

export interface ParallelTask {
  checkpoint(): Promise<void>;
  fail(): void;
}

export class ParallelTaskFailed extends Error {}

export class ParallelTaskGroup {
  private readonly tasks: Promise<boolean>[] = [];

  createTask(): ParallelTask {
    const task = createPromise<boolean>();
    this.tasks.push(task.promise);

    return {
      checkpoint: async () => {
        task.resolve(true);

        const results = await Promise.all(this.tasks);

        if (results.includes(false)) {
          throw new ParallelTaskFailed();
        }
      },
      fail: () => {
        task.resolve(false);
      },
    };
  }
}
