# Diagnostic Logging with Effect

## Overview

Add structured diagnostic logging throughout the main process using Effect's built-in Logger infrastructure with annotation conventions. Logs are always-on in dev mode and target the terminal where Electron is launched, providing a single chronological stream for searching and tracing.

## Goals

- Trace the full lifecycle of a request: renderer sends RPC -> main receives -> CLI spawns -> stream processes -> response sent back
- Surface unexpected runtime errors at integration boundaries (IPC, process spawning, schema decoding)
- Zero config — logs appear automatically during development
- Minimal overhead in production — provide `Logger.none` in packaged builds to suppress all log processing

## Log Level Convention

- **Info** — boundary-crossing events and lifecycle milestones (client connect/disconnect, process spawn, server start/stop, layer construction)
- **Warning** — recoverable failures (parse errors, response dropped due to destroyed WebContents)
- **Error** — unrecoverable failures (spawn failure, non-zero exit code)
- **Debug** — high-frequency operational detail (individual stream event types decoded, IPC messages received/sent)

## Annotation Convention

A single file `src/services/diagnostics.ts` defines annotation key constants:

- `service` — which subsystem produced the log (e.g. `"rpc"`, `"cli"`)
- `operation` — what action is happening (e.g. `"spawn"`, `"decode"`, `"ipc-receive"`)
- `clientId` — Electron WebContents ID for IPC tracing
- `sessionId` — Claude CLI session ID for correlating requests

These are used with `Effect.annotateLogs()` and `Effect.withSpan()` throughout instrumented code.

Spans are used purely for log annotation enrichment — the span name appears in `Logger.pretty` output alongside timestamps and annotations. No distributed tracing provider is needed or planned.

## Dev Logger Layer

`src/services/diagnostics.ts` exports a `DevLogger` layer that replaces the default logger with `Logger.pretty` using `Logger.replace(Logger.defaultLogger, Logger.pretty)`. This produces human-readable output with timestamps, span names, and annotations.

In `main.ts`, the layer composition uses a conditional:

```ts
const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(ClaudeCliLive, NodeContext.layer),
);

const ServerLayer = app.isPackaged
  ? BaseLayer.pipe(Layer.provide(Logger.none))
  : BaseLayer.pipe(Layer.provide(DevLogger));
```

This replaces the default logger in both cases — `Logger.none` in production, `Logger.pretty` in dev.

## Instrumentation Points

### RPC Server (`server.ts`)

All logs annotated with `service: "rpc"`. Wrap `startRpcServer` in `Effect.annotateLogs({ service: "rpc" })`.

- **Client connect** — Info: new WebContents registers (`clientId`)
- **Client disconnect** — Info: WebContents destroyed (`clientId`)
- **Message received** — Debug: `ipcMain.on(RPC_FROM_CLIENT)` fires (`clientId`)
- **Response sent** — Debug: `webContents.send(RPC_FROM_SERVER)` fires (`clientId`)
- **Response dropped** — Warning: WebContents destroyed before send (`clientId`)
- **Server startup** — Info: RPC server created and listening
- **Server shutdown** — Info: finalizer runs, listeners removed
- Wrap `startRpcServer` in `Effect.withSpan("rpc-server")`

### CLI Service (`service.ts`)

All logs annotated with `service: "cli"`.

The `Effect.gen` block inside `Stream.unwrapScoped` in `buildStream` is where spans and annotations are applied — this captures process spawn and stream setup. The `operation` annotation (query/resume/cont) is applied at the `ClaudeCliLive` layer level, wrapping each method's stream.

`sessionId` is not available at spawn time (it arrives via `SystemInitEvent` mid-stream). It is logged as a standalone Info log when decoded from the stream, not as a span annotation.

- **Process spawn** — Info: command and args being executed, within `Effect.withSpan("cli-spawn")`
- **Spawn failure** — Error: error when `Command.start` fails
- **Stream event decoded** — Debug: event type only (not full payload)
- **Parse failure** — Warning: raw line that failed schema decoding
- **Process exit** — Info: exit code after stdout drains
- **Non-zero exit** — Error: exit code + stderr content
- **Layer construction** — Info: `ClaudeCliLive` built, executor acquired

### App Lifecycle (`main.ts`)

- **Runtime creation** — ServerLayer composed, ManagedRuntime constructed
- **RPC server fork** — `startRpcServer` forked on `app.ready`
- **Runtime disposal** — `before-quit` triggered, disposal complete
- **Window creation** — `createWindow` called

Lifecycle events outside the Effect runtime (Electron `app.on` handlers) use `console.log` guarded by `!app.isPackaged` with a `[mao:lifecycle]` prefix for visual consistency with the structured logger output.

## Out of Scope

- **No renderer-side logging** — full IPC flow captured from main process side
- **No per-text-delta logging** — too noisy; event type logged at debug level is sufficient
- **No full event payload logging** — debug event panel already serves this purpose
- **No log file persistence** — terminal only; pipe manually if needed (`npm start 2>&1 | tee debug.log`)

## Testing

No dedicated tests for logging. Verified manually during implementation by running the app in dev mode and confirming log output appears at each instrumentation point.

## Files Changed

- `src/services/diagnostics.ts` — NEW: annotation constants + DevLogger layer
- `src/main.ts` — merge DevLogger into ServerLayer, add lifecycle logs
- `src/services/claude-rpc/server.ts` — add IPC boundary logging + span
- `src/services/claude-cli/service.ts` — add CLI process/stream logging + spans
