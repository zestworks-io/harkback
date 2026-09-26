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

export const browserRpc: Rpc = {
  request: (msg) => browser.runtime.sendMessage(msg),
  connect: () => browser.runtime.connect({ name: "explain" }) as unknown as PortLike,
};
