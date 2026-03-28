import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { HashMap } from "effect";
import { Logger, LogLevel } from "effect";

export const annotations = {
  clientId: "clientId",
  operation: "operation",
  service: "service",
  sessionId: "sessionId",
  tabId: "tabId",
} as const;

export const DevLogger = Logger.pretty;
export const ProdLogger = Logger.replace(Logger.defaultLogger, Logger.none);

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB

const truncateIfNeeded = (filePath: string, maxBytes: number) => {
  try {
    const stat = statSync(filePath);
    if (stat.size > maxBytes) {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const halfIndex = Math.floor(lines.length / 2);
      writeFileSync(filePath, lines.slice(halfIndex).join("\n"), "utf-8");
    }
  } catch {
    // File doesn't exist yet
  }
};

const annotationsToRecord = (
  map: HashMap.HashMap<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of map) {
    result[key] = value;
  }
  return result;
};

export const makeProdFileLogger = (logFilePath: string) => {
  const fileLogger = Logger.make<unknown, void>(
    ({ logLevel, message, date, annotations, cause }) => {
      if (!LogLevel.greaterThanEqual(logLevel, LogLevel.Error)) return;

      const entry = JSON.stringify({
        timestamp: date.toISOString(),
        level: logLevel._tag,
        message: Array.isArray(message) ? message.join(" ") : String(message),
        annotations: annotationsToRecord(annotations),
        ...(cause._tag !== "Empty" ? { cause: String(cause) } : {}),
      });

      truncateIfNeeded(logFilePath, MAX_LOG_BYTES);
      appendFileSync(logFilePath, `${entry}\n`, "utf-8");
    },
  );

  return Logger.add(fileLogger);
};

export const devLog = (
  msg: string,
  isPackaged: boolean,
  logFn: (msg: string) => void = console.log,
) => {
  if (!isPackaged) logFn(`[mao:lifecycle] ${msg}`);
};
