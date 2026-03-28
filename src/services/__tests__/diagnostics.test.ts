import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect, Logger } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devLog, makeProdFileLogger } from "../diagnostics";

describe("makeProdFileLogger", () => {
  let tempDir: string;
  let logFilePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "mao-log-test-"));
    logFilePath = path.join(tempDir, "test.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes JSON lines to the log file when Effect.logError is called", async () => {
    const program = Effect.gen(function* () {
      yield* Effect.logError("something went wrong");
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(makeProdFileLogger(logFilePath))),
    );

    const content = readFileSync(logFilePath, "utf-8").trim();
    const lines = content.split("\n");
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("Error");
    expect(entry.message).toContain("something went wrong");
    expect(entry.timestamp).toBeDefined();
    expect(entry.annotations).toBeDefined();
  });

  it("ignores Effect.logInfo calls (no file output)", async () => {
    const program = Effect.gen(function* () {
      yield* Effect.logInfo("info message");
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(makeProdFileLogger(logFilePath))),
    );

    let content = "";
    try {
      content = readFileSync(logFilePath, "utf-8");
    } catch {
      // File doesn't exist -- that's expected
    }
    expect(content).toBe("");
  });

  it("ignores Effect.logDebug calls (no file output)", async () => {
    const program = Effect.gen(function* () {
      yield* Effect.logDebug("debug message");
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(makeProdFileLogger(logFilePath))),
    );

    let content = "";
    try {
      content = readFileSync(logFilePath, "utf-8");
    } catch {
      // File doesn't exist -- that's expected
    }
    expect(content).toBe("");
  });

  it("each JSON line contains timestamp, level, message, and annotations fields", async () => {
    const program = Effect.gen(function* () {
      yield* Effect.logError("test error").pipe(
        Effect.annotateLogs("service", "test-service"),
      );
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(makeProdFileLogger(logFilePath))),
    );

    const content = readFileSync(logFilePath, "utf-8").trim();
    const entry = JSON.parse(content);

    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("level");
    expect(entry).toHaveProperty("message");
    expect(entry).toHaveProperty("annotations");
    expect(typeof entry.timestamp).toBe("string");
    expect(entry.annotations.service).toBe("test-service");
  });

  it("truncates when log file exceeds maxBytes, removing approximately the oldest half of lines", async () => {
    // Write a file that exceeds MAX_LOG_BYTES (5MB) to trigger truncation
    const bigLines: Array<string> = [];
    const lineContent = "x".repeat(1000);
    for (let i = 0; i < 6000; i++) {
      bigLines.push(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "Error",
          message: lineContent,
        }),
      );
    }
    writeFileSync(logFilePath, `${bigLines.join("\n")}\n`, "utf-8");

    const program = Effect.gen(function* () {
      yield* Effect.logError("trigger truncation");
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(makeProdFileLogger(logFilePath))),
    );

    const afterContent = readFileSync(logFilePath, "utf-8");
    const afterLines = afterContent.split("\n").filter(Boolean);

    // Should have roughly half the lines + 1 new line
    expect(afterLines.length).toBeLessThan(bigLines.length);
    expect(afterLines.length).toBeGreaterThan(0);

    // The last line should be our trigger message
    const lastEntry = JSON.parse(afterLines[afterLines.length - 1]);
    expect(lastEntry.message).toContain("trigger truncation");
  });
});

describe("devLog", () => {
  it("calls logFn with prefixed message when isPackaged=false", () => {
    const calls: Array<string> = [];
    const testLog = (msg: string) => {
      calls.push(msg);
    };

    devLog("app ready", false, testLog);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("[mao:lifecycle] app ready");
  });

  it("does NOT call logFn when isPackaged=true", () => {
    const calls: Array<string> = [];
    const testLog = (msg: string) => {
      calls.push(msg);
    };

    devLog("app ready", true, testLog);

    expect(calls).toHaveLength(0);
  });

  it("message is prefixed with [mao:lifecycle]", () => {
    const calls: Array<string> = [];
    const testLog = (msg: string) => {
      calls.push(msg);
    };

    devLog("test message", false, testLog);

    expect(calls[0]).toMatch(/^\[mao:lifecycle\]/);
  });
});
