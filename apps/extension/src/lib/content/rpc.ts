import { browser } from "wxt/browser";
import type { PortIn, PortOut, Request, ResponseMap } from "../messages";

export interface PortLike {
  postMessage(message: PortIn): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: PortOut) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface Rpc {
  request<T extends Request>(msg: T): Promise<ResponseMap[T["type"]]>;
  connect(): PortLike;
}

/** After the extension reloads or updates, scripts already on a page lose their connection; any runtime call then throws. */
const contextGone = (): boolean => {
  try {
    return !browser.runtime?.id;
  } catch {
    return true;
  }
};
const isContextError = (e: unknown): boolean => e instanceof Error && /context invalidated/i.test(e.message);

/** A port that is already closed, so the card shows its error and the person can reload the page. */
function deadPort(): PortLike {
  const listeners: Array<() => void> = [];
  queueMicrotask(() => listeners.forEach((l) => l()));
  return {
    postMessage: () => undefined,
    disconnect: () => undefined,
    onMessage: { addListener: () => undefined },
    onDisconnect: { addListener: (l) => void listeners.push(l) },
  };
}

export const browserRpc: Rpc = {
  // An orphaned script has nobody to talk to, so its requests stay pending instead of throwing in the page's console.
  request: async (msg) => {
    if (contextGone()) return new Promise(() => undefined);
    try {
      return await browser.runtime.sendMessage(msg);
    } catch (e) {
      if (isContextError(e)) return new Promise(() => undefined);
      throw e;
    }
  },
  connect: () => {
    if (contextGone()) return deadPort();
    try {
      return browser.runtime.connect({ name: "explain" }) as unknown as PortLike;
    } catch (e) {
      if (isContextError(e)) return deadPort();
      throw e;
    }
  },
};
