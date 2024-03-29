import { AbstractWorkerProcess } from './abstract';

export class WorkerSet {
  private readonly processes: Set<AbstractWorkerProcess> = new Set();
  private readonly ids: Map<string, AbstractWorkerProcess> = new Map();
  private readonly pids: Map<number, AbstractWorkerProcess> = new Map();
  private readonly current: Map<number, AbstractWorkerProcess> = new Map();
  private readonly standby: AbstractWorkerProcess[] = [];

  get size(): number {
    return this.current.size;
  }

  get standbys(): number {
    return this.standby.length;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get(id: string): AbstractWorkerProcess | undefined {
    return this.ids.get(id);
  }

  add(worker: AbstractWorkerProcess, idxOrStandby?: number | boolean): void {
    this.processes.add(worker);
    this.ids.set(worker.id, worker);
    this.mapPid(worker);

    if (idxOrStandby === true) {
      this.standby.push(worker);
    } else if (typeof idxOrStandby === 'number') {
      this.setCurrent(idxOrStandby, worker);
    }
  }

  delete(worker: AbstractWorkerProcess): void {
    this.processes.delete(worker);
    this.ids.delete(worker.id);
    worker.pid !== undefined && this.pids.delete(worker.pid);
    this.demote(worker);
  }

  mapPid(worker: AbstractWorkerProcess): void {
    worker.pid !== undefined && this.pids.set(worker.pid, worker);
  }

  isCurrent(worker: AbstractWorkerProcess): worker is AbstractWorkerProcess & { idx: number } {
    return worker.idx !== undefined && this.current.get(worker.idx) === worker;
  }

  getCurrent(idx: number): AbstractWorkerProcess | undefined {
    return this.current.get(idx);
  }

  setCurrent(idx: number, worker: AbstractWorkerProcess): void {
    worker.setIndex(idx);
    this.current.set(idx, worker);
  }

  isStandby(worker: AbstractWorkerProcess): boolean {
    return this.standby.includes(worker);
  }

  popStandby(): AbstractWorkerProcess | undefined {
    return this.standby.shift();
  }

  ejectStandby(): AbstractWorkerProcess[] {
    return this.standby.splice(0, this.standby.length);
  }

  demote(worker: AbstractWorkerProcess): void {
    this.isCurrent(worker) && this.current.delete(worker.idx);
    const standby = this.standby.indexOf(worker);
    standby > -1 && this.standby.splice(standby, 1);
  }

  resolve(workers?: string, self?: string): AbstractWorkerProcess[] {
    if (workers === undefined) {
      return [...this.current.values()];
    }

    const matches: Set<AbstractWorkerProcess> = new Set();
    const n = this.current.size;

    for (const part of workers.trim().split(/\s*,\s*/g)) {
      const m = part.match(/^(!?)(?:(\d+)|(\d+)?(-)(\d+)?|\$(\d+)|([a-f0-9-]+)|self)$/i);

      if (!m) {
        continue;
      }

      const not = !!m[1];
      let collection: Map<any, AbstractWorkerProcess>;
      let match: string | number | number[];

      if (m[2] !== undefined) {
        collection = this.current;
        match = parseInt(m[2], 10);
      } else if (m[4] !== undefined) {
        collection = this.current;
        match = range(
          m[3] !== undefined ? parseInt(m[3], 10) : 0,
          m[5] !== undefined ? parseInt(m[5], 10) : n,
        );
      } else if (m[6] !== undefined) {
        [collection, match] = [this.pids, parseInt(m[6], 10)];
      } else if (m[7] !== undefined) {
        [collection, match] = [this.ids, m[7]];
      } else if (self !== undefined) {
        [collection, match] = [this.ids, self];
      } else {
        continue;
      }

      for (const worker of extractWorkers(collection, match, not)) {
        matches.add(worker);
      }
    }

    return [...matches];
  }

  mapAll<T>(cb: (worker: AbstractWorkerProcess) => T): T[] {
    return [...this.processes].map(cb);
  }

  mapCurrent<T>(cb: (worker: AbstractWorkerProcess) => T): T[] {
    return [...this.current.values()].map(cb);
  }
}

function * extractWorkers<K>(
  collection: Map<K, AbstractWorkerProcess>,
  match: K | K[],
  not: boolean,
): Iterable<AbstractWorkerProcess> {
  Array.isArray(match) || (match = [match]);

  if (not) {
    for (const [key, worker] of collection) {
      if (!match.includes(key)) {
        yield worker;
      }
    }
  } else {
    for (const key of match) {
      const worker = collection.get(key);

      if (worker) {
        yield worker;
      }
    }
  }
}

function range(start: number, end: number): number[] {
  return [...new Array(end - start + 1).keys()].map((v) => v + start);
}
