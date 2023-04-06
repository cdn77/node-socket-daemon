export interface EventMap {
  [event: string]: [...any];
}

type K<T> = string & keyof T;

export type AnyEventHandler = (...args: any) => void;
export type EventHandler<Map extends EventMap, E extends K<Map>> = (...args: Map[E]) => void;

export class EventEmitter<Events extends EventMap = {}> {
  private readonly events: Map<string, Set<AnyEventHandler>> = new Map();

  public on<E extends K<Events>>(event: E, handler: EventHandler<Events, E>): void {
    this.events.has(event) || this.events.set(event, new Set());
    this.events.get(event)!.add(handler);
  }

  public once<E extends K<Events>>(event: E, handler: EventHandler<Events, E>): void {
    const wrapper = ((...args) => {
      this.off(event, wrapper);
      handler(...args);
    }) as EventHandler<Events, E>;

    this.on(event, wrapper);
  }

  public off<E extends K<Events>>(event?: E, handler?: EventHandler<Events, E>): void {
    if (!event) {
      this.events.clear();
    } else if (!handler) {
      this.events.delete(event);
    } else {
      const handlers = this.events.get(event);

      if (handlers && handlers.delete(handler) && !handlers.size) {
        this.events.delete(event);
      }
    }
  }

  public emit<E extends K<Events>>(event: E, ...args: Events[E]): boolean {
    const listeners = this.events.get(event);

    if (!listeners) {
      return false;
    }

    for (const listener of listeners) {
      listener(...args);
    }

    return true;
  }
}
