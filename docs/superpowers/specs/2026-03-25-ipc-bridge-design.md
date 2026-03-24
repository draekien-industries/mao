# IPC Bridge Design: Effect RPC over Electron IPC

## Problem

The `ClaudeCli` service spawns the `claude` CLI subprocess via `@effect/platform` `CommandExecutor`, which requires Node.js and can only run in the Electron main process. The React renderer needs to invoke this service to build chat-like UIs. There is no IPC bridge today — the preload script is empty.

## Goals

- Renderer gets full `Stream.Stream<ClaudeEvent, ClaudeCliError>` from the `ClaudeCli` service
- Support N concurrent CLI instances (multiplexed by request ID)
- Cancellation: renderer can interrupt a running stream, which kills the subprocess
- Effect JS patterns throughout (layers, services, streams, schemas)
- Renderer-side `ClaudeCli` conforms to the existing `Context.Tag` interface — consumers don't know they're talking over IPC

## Approach

Use `@effect/rpc` with `makeNoSerialization` on both client and server. Electron's structured clone handles message transport. The RPC framework provides multiplexing, stream chunking, interrupt propagation, and handler lifecycle automatically.

## Architecture

```
React Component                    Renderer Process                    Main Process
─────────────────                  ─────────────────                   ────────────

useClaudeQuery(params)             RpcClient.makeNoSerialization       RpcServer.makeNoSerialization
  → client.query(params)             onFromClient(msg)                   server.write(clientId, msg)
  → Stream<ClaudeEvent, ...>           ↓                                  ↓
                                   window.electronAPI.rpc.send(msg)    handler: ClaudeCli.query(params)
                                       ↓                                  ↓ (spawns claude subprocess)
                                   ipcRenderer.send ──────IPC──────→ ipcMain.on
                                                                          ↓
                                   ipcRenderer.on ←───────IPC──────← webContents.send
                                       ↓                              onFromServer(response)
                                   clientWrite(response)                  ↑
                                       ↓                              Stream<ClaudeEvent> events
                                   Stream emits ClaudeEvent
```

- `makeNoSerialization` on both sides — Electron structured clone handles transport, no double-serialization
- `webContents.id` as `clientId` — single window for now (multi-window would need per-window cleanup registration)
- `requestId` tracking by `@effect/rpc` — multiplexes N concurrent streams per client
- `Interrupt` message — automatic cancellation from client to server

### Structured Clone Caveat

`makeNoSerialization` passes decoded typed messages (`FromClient<Rpcs>` / `FromServer<Rpcs>`) which cross the IPC boundary via Electron's structured clone. Structured clone preserves plain objects, arrays, primitives, and `bigint` (used by `RequestId`), but strips symbol-keyed properties and class prototypes.

The key risk area is `ResponseExit`, which contains `Exit`/`Cause` values. These use `_tag` string discrimination internally, which survives structured clone. However, any code path that checks for Effect symbols (e.g., `Equal.equals`, `FiberIdTypeId in obj`) would break.

**Mitigation:** The first implementation step should be a proof-of-concept that verifies a full round-trip (request → stream events → exit) works correctly over Electron IPC with `makeNoSerialization`. If symbol-dependent checks cause issues, we fall back to the Protocol-based approach with `RpcSerialization.layerJson`.

## Shared RPC Group

**New file: `src/services/claude-rpc/group.ts`**

Defines the RPC contract imported by both processes:

```typescript
import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"
import { ClaudeCliSpawnError, ClaudeCliParseError, ClaudeCliProcessError } from "../claude-cli/errors"
import { ClaudeEvent } from "../claude-cli/events"
import { QueryParams, ResumeParams, ContinueParams } from "../claude-cli/params"

const ClaudeCliErrorSchema = Schema.Union(
  ClaudeCliSpawnError,
  ClaudeCliParseError,
  ClaudeCliProcessError,
)

export const ClaudeRpcGroup = RpcGroup.make(
  Rpc.make("query", {
    payload: QueryParams,
    success: ClaudeEvent,
    error: ClaudeCliErrorSchema,
    stream: true,
  }),
  Rpc.make("resume", {
    payload: ResumeParams,
    success: ClaudeEvent,
    error: ClaudeCliErrorSchema,
    stream: true,
  }),
  Rpc.make("cont", {
    payload: ContinueParams,
    success: ClaudeEvent,
    error: ClaudeCliErrorSchema,
    stream: true,
  }),
)
```

## Main Process (Server)

**New file: `src/services/claude-rpc/server.ts`**

Creates the RPC server, wires it to Electron IPC, manages lifecycle:

```typescript
import { RpcServer } from "@effect/rpc"
import { Effect } from "effect"
import { ipcMain, type BrowserWindow } from "electron"
import { ClaudeRpcGroup } from "./group"
import { ClaudeCli } from "../claude-cli/service-definition"

// Handler layer — delegates to existing ClaudeCli service
export const ClaudeRpcHandlers = ClaudeRpcGroup.toLayer(
  Effect.gen(function* () {
    const cli = yield* ClaudeCli
    return {
      query: (payload) => cli.query(payload),
      resume: (payload) => cli.resume(payload),
      cont: (payload) => cli.cont(payload),
    }
  })
)

// Start the server and wire to Electron IPC.
// Returns Effect.never to keep the fiber (and its scope) alive for the server's lifetime.
export const startRpcServer = (
  mainWindow: BrowserWindow,
  runtime: ManagedRuntime.ManagedRuntime<any, never>,
) =>
  Effect.gen(function* () {
    const clients = new Map<number, Electron.WebContents>()

    const server = yield* RpcServer.makeNoSerialization(ClaudeRpcGroup, {
      onFromServer: (response) =>
        Effect.sync(() => {
          const webContents = clients.get(response.clientId)
          if (webContents && !webContents.isDestroyed()) {
            webContents.send("rpc:fromServer", response)
          }
        }),
    })

    // Use the ManagedRuntime's runFork for proper lifecycle management
    ipcMain.on("rpc:fromClient", (event, message) => {
      const clientId = event.sender.id
      clients.set(clientId, event.sender)
      runtime.runFork(server.write(clientId, message))
    })

    mainWindow.webContents.on("destroyed", () => {
      const clientId = mainWindow.webContents.id
      clients.delete(clientId)
      runtime.runFork(server.disconnect(clientId))
    })

    // Keep the fiber alive — the server scope must stay open for the server to function.
    // The fiber is interrupted when the ManagedRuntime is disposed (app quit).
    yield* Effect.never
  })
```

**Modified: `src/main.ts`**

Set up ManagedRuntime and start the RPC server after window creation:

```typescript
import { NodeContext } from "@effect/platform-node"
import { Layer, ManagedRuntime } from "effect"
import { ClaudeCliLive } from "./services/claude-cli/service"
import { ClaudeRpcHandlers, startRpcServer } from "./services/claude-rpc/server"

const ServerLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(ClaudeCliLive, NodeContext.layer),
)

const runtime = ManagedRuntime.make(ServerLayer)

app.on("ready", () => {
  const mainWindow = createWindow()
  runtime.runFork(startRpcServer(mainWindow, runtime))
})

// Properly await runtime disposal before quitting
app.on("before-quit", async (e) => {
  e.preventDefault()
  await runtime.dispose()
  app.exit(0)
})
```

## Preload Script

**Modified: `src/preload.ts`**

Generic transport API — knows nothing about Claude or RPCs:

```typescript
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  rpc: {
    send: (message: unknown) => {
      ipcRenderer.send("rpc:fromClient", message)
    },
    onMessage: (callback: (message: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: unknown) => {
        callback(message)
      }
      ipcRenderer.on("rpc:fromServer", handler)
      return () => {
        ipcRenderer.removeListener("rpc:fromServer", handler)
      }
    },
  },
})
```

**New file: `src/preload.d.ts`**

Type declaration for the renderer:

```typescript
interface ElectronAPI {
  rpc: {
    send: (message: unknown) => void
    onMessage: (callback: (message: unknown) => void) => () => void
  }
}

interface Window {
  electronAPI: ElectronAPI
}
```

## Renderer (Client)

**New file: `src/services/claude-rpc/client.ts`**

RPC client with adapter to `ClaudeCli` Context.Tag:

```typescript
import { RpcClient } from "@effect/rpc"
import { Effect, Layer } from "effect"
import { ClaudeRpcGroup } from "./group"
import { ClaudeCli } from "../claude-cli/service-definition"

export const ClaudeCliFromRpc = Layer.scoped(
  ClaudeCli,
  Effect.gen(function* () {
    const { client, write } = yield* RpcClient.makeNoSerialization(
      ClaudeRpcGroup,
      {
        onFromClient: ({ message }) =>
          Effect.sync(() => window.electronAPI.rpc.send(message)),
        supportsAck: false,
      },
    )

    const unsubscribe = window.electronAPI.rpc.onMessage((message) => {
      Effect.runFork(write(message))
    })

    yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribe()))

    return {
      query: (params) => client.query(params),
      resume: (params) => client.resume(params),
      cont: (params) => client.cont(params),
    }
  }),
)
```

**New file: `src/services/claude-rpc/runtime.ts`**

ManagedRuntime and React integration:

```typescript
import { ManagedRuntime } from "effect"
import { createContext, useContext } from "react"
import { ClaudeCliFromRpc } from "./client"
import type { ClaudeCli } from "../claude-cli/service-definition"

export const AppRuntime = ManagedRuntime.make(ClaudeCliFromRpc)

type AppRuntimeType = typeof AppRuntime
const RuntimeContext = createContext<AppRuntimeType>(AppRuntime)

export const RuntimeProvider = RuntimeContext.Provider
export const useRuntime = () => useContext(RuntimeContext)
```

## Refactoring: `continue_` → `cont`

**Modified files:**
- `src/services/claude-cli/service-definition.ts` — rename method `continue_` → `cont`
- `src/services/claude-cli/service.ts` — rename method `continue_` → `cont` in the layer implementation
- `src/services/claude-cli/__tests__/service.test.ts` — update test references

## Error Handling

Three error domains:

- **ClaudeCliError** (existing) — `ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`. Flow through the RPC stream's error channel automatically.
- **RpcClientError** (from `@effect/rpc`) — transport-level failures (`Protocol` or `Unknown` reason). Covers IPC channel closure, unexpected disconnects.
- No custom IPC error type needed — `onFromClient` uses `Effect.sync` (fire-and-forget send), and Electron IPC failures manifest as `RpcClientError`.

Consumer error type: `ClaudeCliError | RpcClientError`.

## Cancellation & Cleanup

**Stream cancellation:**
1. Component interrupts the fiber → RPC client sends `Interrupt` message via `onFromClient`
2. Message flows through IPC to the main process
3. RPC server interrupts the handler fiber → `Command.start` scope closes → subprocess killed

**Window close:**
1. `webContents.on("destroyed")` → `server.disconnect(clientId)`
2. All active fibers for that client are interrupted, all subprocesses killed

**App quit:**
1. `ManagedRuntime.dispose()` on `before-quit` → server scope closes → all fibers interrupted

**Renderer unmount:**
1. `ManagedRuntime` disposal → `addFinalizer` fires → IPC listener removed → in-flight streams interrupted

## File Structure

```
src/
├── main.ts                          # Modified: ManagedRuntime + startRpcServer
├── preload.ts                       # Modified: contextBridge with rpc.send/onMessage
├── preload.d.ts                     # New: Window.electronAPI type declaration
├── services/
│   ├── claude-cli/
│   │   ├── service-definition.ts    # Modified: continue_ → cont
│   │   ├── service.ts              # Modified: continue_ → cont
│   │   ├── errors.ts               # Unchanged
│   │   ├── events.ts               # Unchanged
│   │   ├── params.ts               # Unchanged
│   │   └── __tests__/              # Modified: update for cont rename
│   └── claude-rpc/
│       ├── group.ts                # New: shared RpcGroup definition
│       ├── server.ts               # New: main process RPC server + IPC wiring
│       ├── client.ts               # New: renderer RPC client + ClaudeCli adapter
│       └── runtime.ts              # New: ManagedRuntime + React context/hooks
```

## Dependencies

- `@effect/rpc` — add as direct dependency (already transitive via `@effect/platform`). Pin to same minor range as existing `effect` (3.x).
- `@effect/platform-node` — verify it's available (needed for `NodeContext.layer` in main process)

## Implementation Order

1. **Proof of concept** — Verify `makeNoSerialization` messages survive Electron structured clone (see Structured Clone Caveat above). Minimal round-trip test: send a request, receive stream events and an exit response.
2. **Rename `continue_` → `cont`** — Small refactor across service-definition, service, and tests.
3. **Shared RPC group** — `src/services/claude-rpc/group.ts`
4. **Preload script** — `src/preload.ts` + `src/preload.d.ts`
5. **Main process server** — `src/services/claude-rpc/server.ts` + `src/main.ts` modifications
6. **Renderer client + runtime** — `src/services/claude-rpc/client.ts` + `src/services/claude-rpc/runtime.ts`
7. **Integration test** — End-to-end: React component → IPC → Claude CLI → stream events back
