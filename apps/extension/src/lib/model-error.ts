export type ModelErrorCode = "auth" | "rate_limited" | "timeout" | "network" | "http" | "insecure" | "aborted" | "unavailable";

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ModelError";
  }
}
