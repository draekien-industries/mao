# Diagnostic Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured diagnostic logging using Effect's Logger infrastructure across all integration boundaries in the main process, always-on during development.

**Architecture:** A single `diagnostics.ts` module defines annotation key constants and a `DevLogger` layer (`Logger.pretty`). This layer is conditionally provided in `main.ts` — `Logger.pretty` in dev, `Logger.none` in production. Log calls (`Effect.log`, `Effect.logDebug`, `Effect.logWarning`, `Effect.logError`) with `Effect.annotateLogs` and `Effect.withSpan` are added at integration points in the RPC server and CLI service.

**Tech Stack:** Effect (`Logger`, `Effect.log*`, `Effect.annotateLogs`, `Effect.withSpan`), Electron (`app.isPackaged`)

**Spec:** `docs/superpowers/specs/2026-03-25-diagnostic-logging-design.md`

---

### Task 1: Create diagnostics module

**Files:**
- Create: `src/services/diagnostics.ts`

- [ ] **Step 1: Create the diagnostics module with annotation constants and DevLogger layer**

```typescript
import { Layer, Logger } from "effect";

// Annotation key constants for structured log searching
export const annotations = {
  service: "service",
  operation: "operation",
  clientId: "clientId",
  sessionId: "sessionId",
} as const;

// Human-readable logger for development — replaces the default logger
export const DevLogger = Logger.replace(Logger.defaultLogger, Logger.pretty);

// Silent logger for production — suppresses all log processing
export const ProdLogger = Logger.replace(Logger.defaultLogger, Logger.none);
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/diagnostics.ts
git commit -m "feat: add diagnostics module with annotation constants and dev logger"
```

---

### Task 2: Wire DevLogger into main process runtime

**Files:**
- Modify: `src/main.ts:1-21`

- [ ] **Step 1: Import diagnostics and wire conditional logger into ServerLayer**

Update `main.ts` imports and layer composition:

```typescript
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import { ClaudeCliLive } from "./services/claude-cli/service";
import {
  ClaudeRpcHandlers,
  startRpcServer,
} from "./services/claude-rpc/server";
import { DevLogger, ProdLogger } from "./services/diagnostics";

if (started) {
  app.quit();
}

const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(ClaudeCliLive, NodeContext.layer),
);

const ServerLayer = BaseLayer.pipe(
  Layer.provide(app.isPackaged ? ProdLogger : DevLogger),
);

const runtime = ManagedRuntime.make(ServerLayer);
```

- [ ] **Step 2: Add lifecycle logs to app event handlers**

Add `[mao:lifecycle]` prefixed console.log calls guarded by `!app.isPackaged` to the existing handlers. Update the `app.on("ready", ...)` handler and others:

```typescript
app.on("ready", () => {
  if (!app.isPackaged) console.log("[mao:lifecycle] app ready");
  createWindow();
  runtime.runFork(startRpcServer.pipe(Effect.scoped));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

let isQuitting = false;
app.on("before-quit", async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  if (!app.isPackaged) console.log("[mao:lifecycle] disposing runtime");
  try {
    await runtime.dispose();
  } finally {
    if (!app.isPackaged) console.log("[mao:lifecycle] runtime disposed, exiting");
    app.exit(0);
  }
});
```

Also add a log inside `createWindow`:

```typescript
const createWindow = () => {
  if (!app.isPackaged) console.log("[mao:lifecycle] creating window");
  // ... rest of function unchanged
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire DevLogger into main process runtime with lifecycle logs"
```

---

### Task 3: Instrument RPC server

**Files:**
- Modify: `src/services/claude-rpc/server.ts`

- [ ] **Step 1: Add diagnostic logging to the RPC server**

Replace the full content of `server.ts` with instrumented version. All log calls are annotated with `service: "rpc"` via `Effect.annotateLogs`. The `startRpcServer` effect is wrapped in `Effect.withSpan("rpc-server")`.

```typescript
import { RpcServer } from "@effect/rpc";
import { Effect, Runtime } from "effect";
import { ipcMain } from "electron";
import { ClaudeCli } from "../claude-cli/service-definition";
import { annotations } from "../diagnostics";
import { RPC_FROM_CLIENT, RPC_FROM_SERVER } from "./channels";
import { ClaudeRpcGroup } from "./group";

export const ClaudeRpcHandlers = ClaudeRpcGroup.toLayer(
  Effect.gen(function* () {
    const cli = yield* ClaudeCli;
    return cli;
  }),
);

export const startRpcServer = Effect.gen(function* () {
  const rt = yield* Effect.runtime<never>();
  const clients = new Map<number, Electron.WebContents>();

  yield* Effect.logInfo("RPC server starting");

  const server = yield* RpcServer.makeNoSerialization(ClaudeRpcGroup, {
    onFromServer: (response) =>
      Effect.gen(function* () {
        const webContents = clients.get(response.clientId);
        if (webContents && !webContents.isDestroyed()) {
          webContents.send(RPC_FROM_SERVER, response);
          yield* Effect.logDebug("Response sent").pipe(
            Effect.annotateLogs(annotations.clientId, response.clientId),
          );
        } else {
          yield* Effect.logWarning("Response dropped — client destroyed").pipe(
            Effect.annotateLogs(annotations.clientId, response.clientId),
          );
        }
      }),
  });

  yield* Effect.logInfo("RPC server listening");

  ipcMain.on(RPC_FROM_CLIENT, (event, message) => {
    const clientId = event.sender.id;
    if (!clients.has(clientId)) {
      clients.set(clientId, event.sender);
      Runtime.runFork(rt)(
        Effect.logInfo("Client connected").pipe(
          Effect.annotateLogs(annotations.clientId, clientId),
          Effect.annotateLogs(annotations.service, "rpc"),
        ),
      );
      event.sender.on("destroyed", () => {
        clients.delete(clientId);
        Runtime.runFork(rt)(
          Effect.gen(function* () {
            yield* Effect.logInfo("Client disconnected").pipe(
              Effect.annotateLogs(annotations.clientId, clientId),
            );
            yield* server.disconnect(clientId);
          }).pipe(Effect.annotateLogs(annotations.service, "rpc")),
        );
      });
    }
    Runtime.runFork(rt)(
      Effect.gen(function* () {
        yield* Effect.logDebug("Message received").pipe(
          Effect.annotateLogs(annotations.clientId, clientId),
        );
        yield* server.write(clientId, message);
      }).pipe(Effect.annotateLogs(annotations.service, "rpc")),
    );
  });

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      yield* Effect.logInfo("RPC server shutting down");
      ipcMain.removeAllListeners(RPC_FROM_CLIENT);
    }),
  );

  return yield* Effect.never;
}).pipe(
  Effect.annotateLogs(annotations.service, "rpc"),
  Effect.withSpan("rpc-server"),
);
```

Note: logs inside the `ipcMain.on` callback use `Runtime.runFork(rt)(...)` because they run outside the Effect runtime. These callbacks must include their own `Effect.annotateLogs(annotations.service, "rpc")` since the outer annotation doesn't propagate to separately forked fibers.

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run existing tests to check for regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/services/claude-rpc/server.ts
git commit -m "feat: add diagnostic logging to RPC server"
```

---

### Task 4: Instrument CLI service

**Files:**
- Modify: `src/services/claude-cli/service.ts`

- [ ] **Step 1: Add diagnostic logging to buildStream and ClaudeCliLive**

Update `service.ts` with logging at process spawn, stream decode, parse failure, exit code, and layer construction. The `Effect.gen` inside `Stream.unwrapScoped` is where span and annotations are applied. `buildStream` accepts an `operation` parameter (query/resume/cont) that is annotated on the setup effect, propagating to all log calls within the stream.

```typescript
import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Fiber, Layer, Schema, Stream } from "effect";
import {
  ClaudeCliParseError,
  ClaudeCliProcessError,
  ClaudeCliSpawnError,
} from "./errors";
import { ClaudeEvent } from "./events";
import {
  ContinueParams,
  type FlagDef,
  QueryParams,
  ResumeParams,
} from "./params";
import { ClaudeCli } from "./service-definition";
import { annotations } from "../diagnostics";

type ParamClass = {
  readonly flagMap: Record<string, FlagDef>;
  readonly commandFlags: readonly string[];
};

export const buildArgs = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
): string[] => {
  const args: string[] = [...ParamType.commandFlags];
  const values: Record<string, unknown> = { ...params };

  for (const [field, def] of Object.entries(ParamType.flagMap)) {
    const value = values[field];

    switch (def.kind) {
      case "string":
        if (value != null && value !== "") args.push(def.flag, value as string);
        break;
      case "number":
        if (value !== undefined) args.push(def.flag, String(value));
        break;
      case "boolean":
        if (value === true) args.push(def.flag);
        break;
      case "variadic":
        if (Array.isArray(value) && value.length > 0)
          args.push(def.flag, ...value);
        break;
      case "compound-boolean":
        if (value === true) args.push(...def.flags);
        break;
    }
  }

  return args;
};

const buildStream = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
  operation: string,
): Stream.Stream<
  ClaudeEvent,
  ClaudeCliSpawnError | ClaudeCliParseError | ClaudeCliProcessError,
  CommandExecutor.CommandExecutor
> => {
  const args = buildArgs(params, ParamType);
  let command = Command.make("claude", ...args);
  if (params.cwd) command = Command.workingDirectory(command, params.cwd);

  return Stream.unwrapScoped(
    Effect.gen(function* () {
      yield* Effect.logInfo("Spawning CLI process").pipe(
        Effect.annotateLogs("args", args.join(" ")),
      );

      const process = yield* Command.start(command).pipe(
        Effect.tapError((cause) =>
          Effect.logError("CLI spawn failed").pipe(
            Effect.annotateLogs("error", String(cause)),
          ),
        ),
        Effect.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
      );

      yield* Effect.logInfo("CLI process started");

      // Collect stderr concurrently; forkScoped ties the fiber lifetime to the stream scope
      const stderrFiber = yield* process.stderr.pipe(
        Stream.decodeText(),
        Stream.runFold("", (acc, s) => acc + s),
        Effect.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
        Effect.forkScoped,
      );

      // After stdout drains, verify exit code; fail stream if non-zero
      const checkExit = Effect.gen(function* () {
        const exitCode = yield* process.exitCode.pipe(
          Effect.mapError(
            (cause) =>
              new ClaudeCliSpawnError({
                message: "Failed to get process exit code",
                cause,
              }),
          ),
        );

        yield* Effect.logInfo("CLI process exited").pipe(
          Effect.annotateLogs("exitCode", exitCode),
        );

        if (exitCode !== 0) {
          const stderr = yield* Fiber.join(stderrFiber);
          yield* Effect.logError("CLI process failed").pipe(
            Effect.annotateLogs("exitCode", exitCode),
            Effect.annotateLogs("stderr", stderr),
          );
          return yield* new ClaudeCliProcessError({ exitCode, stderr });
        }
      });

      const eventStream = process.stdout.pipe(
        Stream.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((line) => line.trim().length > 0),
        Stream.mapEffect((line) =>
          Schema.decodeUnknown(Schema.parseJson(ClaudeEvent))(line).pipe(
            Effect.tap((event) =>
              Effect.logDebug("Event decoded").pipe(
                Effect.annotateLogs("eventType", event.type),
                Effect.annotateLogs(
                  annotations.sessionId,
                  "session_id" in event ? (event.session_id ?? "unknown") : "unknown",
                ),
              ),
            ),
            Effect.tapError(() =>
              Effect.logWarning("Event parse failed").pipe(
                Effect.annotateLogs("raw", line.slice(0, 200)),
              ),
            ),
            Effect.mapError(
              (cause) => new ClaudeCliParseError({ raw: line, cause }),
            ),
          ),
        ),
        // Stream.concat runs checkExit after stdout drains and propagates any ClaudeCliError
        Stream.concat(Stream.fromEffect(checkExit).pipe(Stream.drain)),
      );

      return eventStream;
    }).pipe(
      Effect.annotateLogs(annotations.service, "cli"),
      Effect.annotateLogs(annotations.operation, operation),
      Effect.withSpan("cli-spawn"),
    ),
  );
};

export const ClaudeCliLive = Layer.effect(
  ClaudeCli,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    yield* Effect.logInfo("ClaudeCliLive layer constructed");

    const provide = <A, E>(
      stream: Stream.Stream<A, E, CommandExecutor.CommandExecutor>,
    ) =>
      stream.pipe(
        Stream.provideService(CommandExecutor.CommandExecutor, executor),
      );

    return {
      query: (params: QueryParams) =>
        provide(buildStream(params, QueryParams, "query")),
      resume: (params: ResumeParams) =>
        provide(buildStream(params, ResumeParams, "resume")),
      cont: (params: ContinueParams) =>
        provide(buildStream(params, ContinueParams, "cont")),
    };
  }).pipe(Effect.annotateLogs(annotations.service, "cli")),
);
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run existing tests to check for regressions**

Run: `npx vitest run`
Expected: All tests pass. Note: existing tests use mock `CommandExecutor` layers — the log calls will execute but output is harmless (default logger writes to console, which is fine in tests).

- [ ] **Step 4: Commit**

```bash
git add src/services/claude-cli/service.ts
git commit -m "feat: add diagnostic logging to CLI service"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the app in dev mode**

Run: `npm start`
Expected: Terminal shows structured log output including:
- `[mao:lifecycle] app ready`
- `[mao:lifecycle] creating window`
- Logger.pretty formatted lines with `service=rpc` showing "RPC server starting" and "RPC server listening"
- Logger.pretty formatted lines with `service=cli` showing "ClaudeCliLive layer constructed"

- [ ] **Step 2: Send a chat message in the UI**

Type a message in the chat input and send it.
Expected: Terminal shows a sequence of logs:
- `service=rpc` "Message received" with `clientId`
- `service=cli` "Spawning CLI process" with args
- `service=cli` "CLI process started"
- Multiple `service=cli` "Event decoded" debug lines with `eventType`
- `service=cli` "CLI process exited" with `exitCode=0`
- `service=rpc` "Response sent" debug lines with `clientId`

- [ ] **Step 3: Close the app**

Close the window or Ctrl+C.
Expected: Terminal shows:
- `[mao:lifecycle] disposing runtime`
- `service=rpc` "RPC server shutting down"
- `[mao:lifecycle] runtime disposed, exiting`
