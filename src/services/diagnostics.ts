import { Logger } from "effect";

// Annotation key constants for structured log searching
export const annotations = {
  service: "service",
  operation: "operation",
  clientId: "clientId",
  sessionId: "sessionId",
} as const;

// Human-readable logger for development — replaces the default logger
export const DevLogger = Logger.pretty;

// Silent logger for production — suppresses all log processing
export const ProdLogger = Logger.replace(Logger.defaultLogger, Logger.none);
