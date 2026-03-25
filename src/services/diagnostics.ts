import { Logger } from "effect";

export const annotations = {
  service: "service",
  operation: "operation",
  clientId: "clientId",
  sessionId: "sessionId",
} as const;

export const DevLogger = Logger.pretty;
export const ProdLogger = Logger.replace(Logger.defaultLogger, Logger.none);
