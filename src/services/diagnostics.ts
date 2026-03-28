import { Logger } from "effect";

export const annotations = {
  clientId: "clientId",
  operation: "operation",
  service: "service",
  sessionId: "sessionId",
  tabId: "tabId",
} as const;

export const DevLogger = Logger.pretty;
export const ProdLogger = Logger.replace(Logger.defaultLogger, Logger.none);

export const devLog = (
  msg: string,
  isPackaged: boolean,
  logFn: (msg: string) => void = console.log,
) => {
  if (!isPackaged) logFn(`[mao:lifecycle] ${msg}`);
};
