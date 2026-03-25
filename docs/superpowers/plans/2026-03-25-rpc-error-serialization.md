# RPC Error Serialization Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Also read: @effect-ts skill before touching any Effect code.

**Goal:** Fix CLI error responses failing to serialize through Electron IPC by switching from `makeNoSerialization` to the Protocol-based `make` API and making error `cause` fields serializable.

**Architecture:** Replace `RpcServer.makeNoSerialization` / `RpcClient.makeNoSerialization` with `RpcServer.make` / `RpcClient.make`, which encode all protocol messages (Exit, Cause, RequestId, Chunks) to plain JSON objects via the RPC group schemas before they hit the transport. Implement thin `Protocol` layers for Electron IPC on both server (main process) and client (renderer) sides using the `Protocol.make` factory. Change `cause: Schema.Unknown` to `cause: Schema.String` in error types to prevent non-serializable objects leaking through encoding.

**Tech Stack:** Effect v3 (`effect`, `@effect/rpc`), Electron 41, TypeScript strict, vitest

---

## File Structure

**Modified:**
- `src/services/claude-cli/errors.ts` — change `cause` schema from `Unknown` to `String`
- `src/services/claude-cli/__tests__/errors.test.ts` — update tests for string `cause`
- `src/services/claude-cli/service.ts` — stringify cause at error construction sites
- `src/services/claude-rpc/server.ts` — replace `makeNoSerialization` with Protocol + `make`
- `src/services/claude-rpc/client.ts` — replace `makeNoSerialization` with Protocol + `make`

**Unchanged:**
- `src/main.ts` — existing layer composition and `Effect.scoped` work as-is
- `src/preload.ts` — generic `unknown` message types, no change needed
- `src/services/claude-rpc/runtime.ts` — `ManagedRuntime.make(ClaudeCliFromRpc)` unchanged
- `src/services/claude-cli/service-definition.ts` — `ClaudeCli` tag interface unchanged
- `src/services/claude-rpc/group.ts` — RPC group definition unchanged
- `src/services/claude-rpc/channels.ts` — channel names unchanged

---

## Steps

### Task 1: Make error `cause` field serializable

**Files:**
- Modify: `src/services/claude-cli/errors.ts:3-11`
- Test: `src/services/claude-cli/__tests__/errors.test.ts`

- [ ] **Step 1: Update the error test to expect string `cause`**

In `src/services/claude-cli/__tests__/errors.test.ts`, change the existing `ClaudeCliSpawnError` and `ClaudeCliParseError` tests to pass strings for `cause` instead of raw Error objects, and assert the `cause` value:

```typescript
import { describe, expect, it } from "vitest";

describe("ClaudeCliSpawnError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliSpawnError } = await import("../errors");
    const err = new ClaudeCliSpawnError({
      message: "not found",
      cause: "Error: ENOENT",
    });
    expect(err._tag).toBe("ClaudeCliSpawnError");
    expect(err.message).toBe("not found");
    expect(err.cause).toBe("Error: ENOENT");
  });
});

describe("ClaudeCliParseError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliParseError } = await import("../errors");
    const err = new ClaudeCliParseError({
      raw: "{bad}",
      cause: "SyntaxError: Unexpected token",
    });
    expect(err._tag).toBe("ClaudeCliParseError");
    expect(err.raw).toBe("{bad}");
    expect(err.cause).toBe("SyntaxError: Unexpected token");
  });
});

describe("ClaudeCliProcessError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliProcessError } = await import("../errors");
    const err = new ClaudeCliProcessError({
      exitCode: 1,
      stderr: "rate limit",
    });
    expect(err._tag).toBe("ClaudeCliProcessError");
    expect(err.exitCode).toBe(1);
    expect(err.stderr).toBe("rate limit");
  });
});
```

- [ ] **Step 2: Run test to establish baseline**

Run: `npx vitest run src/services/claude-cli/__tests__/errors.test.ts`
Expected: PASS — `Schema.Unknown` accepts strings so the updated tests pass with the old schema. The new `expect(err.cause).toBe(...)` assertions validate the string value going forward.

- [ ] **Step 3: Change `cause` schema to `Schema.String`**

In `src/services/claude-cli/errors.ts`, replace `Schema.Unknown` with `Schema.String` in both error classes:

```typescript
import { Schema } from "effect";

export class ClaudeCliSpawnError extends Schema.TaggedError<ClaudeCliSpawnError>()(
  "ClaudeCliSpawnError",
  { message: Schema.String, cause: Schema.String },
) {}

export class ClaudeCliParseError extends Schema.TaggedError<ClaudeCliParseError>()(
  "ClaudeCliParseError",
  { raw: Schema.String, cause: Schema.String },
) {}

export class ClaudeCliProcessError extends Schema.TaggedError<ClaudeCliProcessError>()(
  "ClaudeCliProcessError",
  { exitCode: Schema.Number, stderr: Schema.String },
) {}

export const ClaudeCliErrorSchema = Schema.Union(
  ClaudeCliSpawnError,
  ClaudeCliParseError,
  ClaudeCliProcessError,
);

export type ClaudeCliError = Schema.Schema.Type<typeof ClaudeCliErrorSchema>;

export function formatClaudeCliError(err: ClaudeCliError): string {
  switch (err._tag) {
    case "ClaudeCliSpawnError":
      return `Failed to start Claude CLI: ${err.message}`;
    case "ClaudeCliProcessError":
      return `Claude CLI exited with code ${err.exitCode}: ${err.stderr}`;
    case "ClaudeCliParseError":
      return `Failed to parse CLI output: ${err.raw}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/claude-cli/__tests__/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/errors.ts src/services/claude-cli/__tests__/errors.test.ts
git commit -m "fix: change error cause field from Schema.Unknown to Schema.String"
```

---

### Task 2: Stringify cause at error construction sites

**Files:**
- Modify: `src/services/claude-cli/service.ts:78-80,89-91,98-103,122-124,146-148`
- Test: `src/services/claude-cli/__tests__/service.test.ts` (existing tests)

- [ ] **Step 1: Update all `ClaudeCliSpawnError` constructions to stringify `cause`**

In `src/services/claude-cli/service.ts`, there are four places where `ClaudeCliSpawnError` is created. Each passes the raw `cause` parameter. Change all four to `cause: String(cause)`:

Line 79 (spawn failure):
```typescript
// Before:
(cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
// After:
(cause) => new ClaudeCliSpawnError({ message: String(cause), cause: String(cause) }),
```

Line 90 (stderr read failure):
```typescript
// Before:
(cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
// After:
(cause) => new ClaudeCliSpawnError({ message: String(cause), cause: String(cause) }),
```

Line 100 (exit code read failure):
```typescript
// Before:
new ClaudeCliSpawnError({
  message: "Failed to get process exit code",
  cause,
}),
// After:
new ClaudeCliSpawnError({
  message: "Failed to get process exit code",
  cause: String(cause),
}),
```

Line 123 (stdout read failure):
```typescript
// Before:
(cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
// After:
(cause) => new ClaudeCliSpawnError({ message: String(cause), cause: String(cause) }),
```

- [ ] **Step 2: Update `ClaudeCliParseError` construction to stringify `cause`**

Line 147 (JSON parse failure):
```typescript
// Before:
(cause) => new ClaudeCliParseError({ raw: line, cause }),
// After:
(cause) => new ClaudeCliParseError({ raw: line, cause: String(cause) }),
```

- [ ] **Step 3: Run all existing service tests to verify no regressions**

Run: `npx vitest run src/services/claude-cli/__tests__/service.test.ts`
Expected: PASS — all four tests pass. The tests don't inspect the `cause` field, only `exitCode`, `stderr`, `raw`, and event types.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/service.ts
git commit -m "fix: stringify cause values at error construction sites"
```

---

### Task 3: Implement server-side Electron Protocol

**Files:**
- Modify: `src/services/claude-rpc/server.ts`

This replaces the entire server file. The `ClaudeRpcHandlers` export stays. The `startRpcServer` export is rewritten to use `RpcServer.make` with a Protocol layer.

- [ ] **Step 1: Write the new server implementation**

Replace `src/services/claude-rpc/server.ts` with:

```typescript
import { RpcServer } from "@effect/rpc";
import { Effect, Layer, Mailbox, Option, Runtime } from "effect";
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

// Protocol.make factory: receives a `write` callback for forwarding
// decoded client messages to the RPC server. Returns everything except
// `run` — the factory assembles `run` automatically, buffering any
// messages that arrive before `run` is called by RpcServer.make.
const ElectronServerProtocol = Layer.scoped(
  RpcServer.Protocol,
  RpcServer.Protocol.make((write) =>
    Effect.gen(function* () {
      const clients = new Map<number, Electron.WebContents>();
      const disconnects = yield* Mailbox.make<number>();
      const rt = yield* Effect.runtime<never>();

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
          event.sender.once("destroyed", () => {
            clients.delete(clientId);
            Runtime.runFork(rt)(
              Effect.gen(function* () {
                yield* Effect.logInfo("Client disconnected").pipe(
                  Effect.annotateLogs(annotations.clientId, clientId),
                );
                yield* disconnects.offer(clientId);
              }).pipe(Effect.annotateLogs(annotations.service, "rpc")),
            );
          });
        }
        Runtime.runFork(rt)(
          Effect.gen(function* () {
            yield* Effect.logDebug("Message received");
            yield* write(clientId, message);
          }).pipe(
            Effect.annotateLogs(annotations.clientId, clientId),
            Effect.annotateLogs(annotations.service, "rpc"),
          ),
        );
      });

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.logInfo("RPC server shutting down");
          ipcMain.removeAllListeners(RPC_FROM_CLIENT);
        }),
      );

      return {
        disconnects,
        send: (clientId: number, response: unknown) =>
          Effect.gen(function* () {
            const webContents = clients.get(clientId);
            if (webContents && !webContents.isDestroyed()) {
              webContents.send(RPC_FROM_SERVER, response);
              yield* Effect.logDebug("Response sent").pipe(
                Effect.annotateLogs(annotations.clientId, clientId),
              );
            } else {
              yield* Effect.logWarning(
                "Response dropped — client destroyed",
              ).pipe(Effect.annotateLogs(annotations.clientId, clientId));
            }
          }),
        end: (clientId: number) =>
          Effect.sync(() => {
            clients.delete(clientId);
          }),
        clientIds: Effect.sync(() => new Set(clients.keys())),
        initialMessage: Effect.succeed(Option.none()),
        supportsAck: false,
        supportsTransferables: false,
        supportsSpanPropagation: false,
      };
    }),
  ),
);

export const startRpcServer = Effect.gen(function* () {
  yield* Effect.logInfo("RPC server starting");
  return yield* RpcServer.make(ClaudeRpcGroup);
}).pipe(
  Effect.provide(ElectronServerProtocol),
  Effect.annotateLogs(annotations.service, "rpc"),
  Effect.withSpan("rpc-server"),
);
```

**Key differences from current code:**
- Uses `RpcServer.Protocol.make` factory — the factory provides a `write` callback for forwarding client messages; it assembles the `run` method automatically and buffers messages arriving before `run` is called
- `RpcServer.make` internally wraps `makeNoSerialization` and encodes Exit/Cause/RequestId to plain JSON before calling `Protocol.send`
- `Protocol.send` receives already-encoded `FromServerEncoded` — plain objects that survive Electron's structured clone
- Client tracking and disconnect handling move into the Protocol implementation
- `Mailbox<number>` for disconnects; `make` reads from it internally
- All three boolean flags included: `supportsAck: false`, `supportsTransferables: false`, `supportsSpanPropagation: false`

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. If `Rpc.Context<Rpcs>` is not `never` (unlikely since our schemas have no context requirements), you may need to provide an empty context.

- [ ] **Step 3: Commit**

```bash
git add src/services/claude-rpc/server.ts
git commit -m "refactor: replace makeNoSerialization with Protocol-based RpcServer.make"
```

---

### Task 4: Implement client-side Electron Protocol

**Files:**
- Modify: `src/services/claude-rpc/client.ts`

This replaces the entire client file.

- [ ] **Step 1: Write the new client implementation**

Replace `src/services/claude-rpc/client.ts` with:

```typescript
import { RpcClient } from "@effect/rpc";
import { RpcClientError } from "@effect/rpc/RpcClientError";
import { Effect, Layer, Runtime, Stream } from "effect";
import type { ClaudeCliError } from "../claude-cli/errors";
import { ClaudeCliSpawnError } from "../claude-cli/errors";
import { ClaudeCli } from "../claude-cli/service-definition";
import { ClaudeRpcGroup } from "./group";

const mapRpcError = (err: ClaudeCliError | RpcClientError): ClaudeCliError =>
  err._tag === "RpcClientError"
    ? new ClaudeCliSpawnError({
        message: `RPC transport error: ${err.message}`,
        cause: String(err.cause ?? "unknown"),
      })
    : err;

// Protocol.make factory: receives a `write` callback for forwarding
// decoded server messages to the RPC client. Returns everything except
// `run` — the factory assembles `run` automatically.
const ElectronClientProtocol = Layer.scoped(
  RpcClient.Protocol,
  RpcClient.Protocol.make((write) =>
    Effect.gen(function* () {
      const rt = yield* Effect.runtime<never>();

      const unsubscribe = window.electronAPI.rpc.onMessage((message) => {
        Runtime.runFork(rt)(write(message));
      });

      yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribe()));

      return {
        send: (request: unknown) =>
          Effect.sync(() => window.electronAPI.rpc.send(request)),
        supportsAck: false,
        supportsTransferables: false,
      };
    }),
  ),
);

export const ClaudeCliFromRpc = Layer.scoped(
  ClaudeCli,
  Effect.gen(function* () {
    const client = yield* RpcClient.make(ClaudeRpcGroup);
    return {
      query: (params) =>
        client.query(params).pipe(Stream.mapError(mapRpcError)),
      resume: (params) =>
        client.resume(params).pipe(Stream.mapError(mapRpcError)),
      cont: (params) =>
        client.cont(params).pipe(Stream.mapError(mapRpcError)),
    };
  }),
).pipe(Layer.provide(ElectronClientProtocol));
```

**Key differences from current code:**
- Uses `RpcClient.Protocol.make` factory — same pattern as server
- `RpcClient.make` wraps `makeNoSerialization` internally and handles encoding/decoding
- `Protocol.send` sends already-encoded `FromClientEncoded` (plain objects)
- No manual `write` function or `onMessage` wiring needed — the factory handles this
- `RpcClientError` is mapped to `ClaudeCliSpawnError` to preserve the `ClaudeCli` service interface

**Note on `RpcClientError` import:** The direct path `@effect/rpc/RpcClientError` should work. If it doesn't resolve, use `import { RpcClientError as RpcClientErrorNs } from "@effect/rpc"` and reference `RpcClientErrorNs.RpcClientError` (the named export from `@effect/rpc` is the namespace, not the class).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. Watch for:
- `RpcClientError` import path
- Stream error type mismatch after `mapRpcError`

- [ ] **Step 3: Commit**

```bash
git add src/services/claude-rpc/client.ts
git commit -m "refactor: replace makeNoSerialization with Protocol-based RpcClient.make"
```

---

### Task 5: Build and integration verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Build the app**

Run: `npm run build` (or the project's build command)
Expected: Build succeeds without errors.

- [ ] **Step 3: Manual smoke test — error case**

Launch the app. Trigger a CLI error scenario (e.g., send a query when `claude` binary is misconfigured, or the CLI returns a non-zero exit code). Verify:
- The error displays in the UI via `formatClaudeCliError` (red error banner)
- No "Failed to serialize arguments" error in the console
- No "Error sending from webFrameMain" error in the console

- [ ] **Step 4: Manual smoke test — success case**

Send a normal query. Verify:
- Streaming events appear as before (init, content deltas, assistant message, result)
- No regressions in the chat flow

- [ ] **Step 5: Commit any fixes**

If any issues were found and fixed during smoke testing, commit them.
