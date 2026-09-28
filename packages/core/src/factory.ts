import { ENVELOPE_VERSION, type EventOf, type EventType, type PayloadOf } from "@harkback/spec";
import { ulid } from "./ids";

export interface EventFactory {
  make<T extends EventType>(type: T, payload: PayloadOf<T>): EventOf<T>;
}

export function createEventFactory(o: { device: string; nextSeq: () => number; now?: () => number; newId?: () => string }): EventFactory {
  const now = o.now ?? Date.now;
  const newId = o.newId ?? (() => ulid());
  return {
    make<T extends EventType>(type: T, payload: PayloadOf<T>): EventOf<T> {
      return {
        v: ENVELOPE_VERSION,
        id: newId(),
        device: o.device,
        seq: o.nextSeq(),
        ts: new Date(now()).toISOString(),
        enc: "none",
        type,
        payload,
      } as unknown as EventOf<T>;
    },
  };
}
