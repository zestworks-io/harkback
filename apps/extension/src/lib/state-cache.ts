import { replay, type State } from "@harkback/core";
import type { EventStore } from "./store";

export class StateCache {
  private state: Promise<State> | null = null;

  constructor(private readonly store: Pick<EventStore, "all">) {}

  get(): Promise<State> {
    this.state ??= this.store.all().then((events) => replay(events));
    return this.state;
  }

  invalidate(): void {
    this.state = null;
  }
}
