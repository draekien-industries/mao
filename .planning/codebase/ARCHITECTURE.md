# Architecture

**Analysis Date:** 2026-03-25

## Pattern Overview

**Overall:** Electron multi-process app with Effect-TS service layers and RPC bridge

**Key Characteristics:**
- Three Electron processes: main, preload, renderer — each with its own Vite build target
- Effect-TS service/layer architecture for dependency injection and streaming
- `@effect/rpc` provides type-safe RPC over Electron IPC, bridging main<->renderer
- TanStack Router (file-based, hash history) for renderer-side routing
- React 19 with React Compiler (via Babel plugin) for the UI layer

## Process Model

**Main Process (`src/main.ts`):**
- Entry point for Electron; creates `BrowserWindow`, manages app lifecycle
- Builds an Effect `ManagedRuntime` from composed layers: `NodeContext` -> `ClaudeCliLive` -> `ClaudeRpcHandlers`
- Starts the RPC server on `app.on("ready")` via `runtime.runFork(startRpcServer)`
- Disposes the runtime gracefully on `app.on("before-quit")`
- Logging: `DevLogger` (pretty) in dev, `ProdLogger` (none) in production, selected via `app.isPackaged`

**Preload Script (`src/preload.ts`):**
- Thin bridge — exposes `window.electronAPI.rpc.send()` and `window.electronAPI.rpc.onMessage()` via `contextBridge`
- Uses two IPC channels: `rpc:fromClient` (renderer->main) and `rpc:fromServer` (main->renderer)
- No business logic; purely transport

**Renderer Process (`src/renderer.tsx`):**
- React 19 app mounted on `#root`
- Creates its own `ManagedRuntime` (`AppRuntime`) from `ClaudeCliFromRpc` layer
- Provides `AppRuntime` via React context (`RuntimeProvider`), consumed by hooks via `useRuntime()`

## Layers

**NodeContext (from `@effect/platform-node`):**
- Purpose: Provides platform services (filesystem, command executor, etc.) to the main process
- Location: External dependency, composed in `src/main.ts`
- Used by: `ClaudeCliLive` (needs `CommandExecutor`)

**ClaudeCliLive (`src/services/claude-cli/service.ts`):**
- Purpose: Implements the `ClaudeCli` service by spawning `claude` CLI child processes
- Location: `src/services/claude-cli/service.ts`
- Contains: Process spawning, stdout JSON stream parsing, stderr collection, exit code checking
- Depends on: `CommandExecutor` from `@effect/platform`
- Used by: `ClaudeRpcHandlers` (main process server-side)

**ClaudeRpcHandlers (`src/services/claude-rpc/server.ts`):**
- Purpose: Wraps `ClaudeCli` as RPC handler layer, making it callable over IPC
- Location: `src/services/claude-rpc/server.ts`
- Contains: `ClaudeRpcGroup.toLayer(...)` — maps the RPC group to the CLI service
- Depends on: `ClaudeCli`
- Used by: `RpcServer.make(ClaudeRpcGroup)` inside `startRpcServer`

**ClaudeCliFromRpc (`src/services/claude-rpc/client.ts`):**
- Purpose: Provides `ClaudeCli` in the renderer by proxying calls over IPC to the main process
- Location: `src/services/claude-rpc/client.ts`
- Contains: `RpcClient.make(ClaudeRpcGroup)` wrapped as a `ClaudeCli` layer
- Depends on: `ElectronClientProtocol` (IPC transport), `window.electronAPI`
- Used by: `AppRuntime` in `src/services/claude-rpc/runtime.ts`

**Diagnostics (`src/services/diagnostics.ts`):**
- Purpose: Structured log annotations and logger configuration
- Location: `src/services/diagnostics.ts`
- Contains: Annotation keys (`service`, `operation`, `clientId`, `sessionId`), `DevLogger`, `ProdLogger`
- Used by: All main-process service code

## Data Flow

**Chat message flow (user prompt -> streamed response):**

1. User types a message in `src/routes/index.tsx` and submits the form
2. `useClaudeChat` hook (`src/hooks/use-claude-chat.ts`) calls `sendMessage(prompt)`
3. Hook builds an Effect program that resolves `ClaudeCli` from the runtime
4. First message calls `cli.query(...)`, follow-ups call `cli.resume(...)` with the stored `session_id`
5. `ClaudeCliFromRpc` serializes the call via `@effect/rpc` client and sends it over `window.electronAPI.rpc.send()`
6. Preload forwards message to main process via `ipcRenderer.send(RPC_FROM_CLIENT, message)`
7. Main process `ElectronServerProtocol` receives via `ipcMain.on(RPC_FROM_CLIENT, ...)` and calls `write(clientId, message)`
8. `RpcServer.make(ClaudeRpcGroup)` routes to `ClaudeRpcHandlers` -> `ClaudeCliLive`
9. `ClaudeCliLive.buildStream()` spawns `claude` CLI with `--output-format stream-json` flags
10. Stdout lines are parsed as JSON, decoded into `ClaudeEvent` via Effect Schema
11. Events stream back through `RpcServer` -> `ElectronServerProtocol.send()` -> `webContents.send(RPC_FROM_SERVER, ...)`
12. Preload delivers to renderer via `ipcRenderer.on(RPC_FROM_SERVER, ...)`
13. `ElectronClientProtocol` calls `write(message as FromServerEncoded)` to feed `RpcClient`
14. `useClaudeChat` processes each `ClaudeEvent`:
    - `SystemInitEvent`: captures `session_id` for subsequent resume calls
    - `StreamEventMessage` with `TextDelta`: appends to `streamingText` state
    - `AssistantMessageEvent`: finalizes message into `messages` array, clears streaming text
    - `ResultEvent`: marks streaming as complete

**State Management:**
- React `useState` for UI state (messages, streaming text, error, debug panel)
- `useRef` for non-rendering state (session ID, event log, streaming guard)
- Effect `ManagedRuntime` for service dependencies (one per process)
- No global state store — state is local to `useClaudeChat` hook

## Key Abstractions

**ClaudeCli Service (`src/services/claude-cli/service-definition.ts`):**
- Purpose: Abstract interface for interacting with Claude CLI — decoupled from transport
- Pattern: Effect `Context.Tag` with three streaming methods: `query`, `resume`, `cont`
- Two implementations: `ClaudeCliLive` (main process, spawns processes) and `ClaudeCliFromRpc` (renderer, proxies over IPC)

**ClaudeRpcGroup (`src/services/claude-rpc/group.ts`):**
- Purpose: Defines the RPC contract (schema for payloads, success types, errors)
- Pattern: `RpcGroup.make(...)` with three streaming RPCs
- Used by both server (`ClaudeRpcGroup.toLayer(...)`) and client (`RpcClient.make(ClaudeRpcGroup)`)

**ClaudeEvent Union (`src/services/claude-cli/events.ts`):**
- Purpose: Type-safe representation of all Claude CLI `stream-json` output events
- Pattern: Effect `Schema.Union` of tagged class schemas with type guards for narrowing
- Members: `SystemInitEvent`, `SystemRetryEvent`, `StreamEventMessage`, `AssistantMessageEvent`, `ResultEvent`, `UnknownEvent`

**Param Classes (`src/services/claude-cli/params.ts`):**
- Purpose: Schema-validated parameters that also encode CLI flag mappings
- Pattern: `Schema.Class` with static `flagMap` and `commandFlags` for building CLI args
- Classes: `QueryParams`, `ResumeParams`, `ContinueParams`

**Error Types (`src/services/claude-cli/errors.ts`):**
- Purpose: Typed error hierarchy for CLI operations
- Pattern: `Schema.TaggedError` union — `ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`
- Includes `formatClaudeCliError()` for human-readable messages

## Entry Points

**Electron Main (`src/main.ts`):**
- Location: `src/main.ts`
- Triggers: Electron app launch
- Responsibilities: Window creation, runtime lifecycle, RPC server startup

**Preload (`src/preload.ts`):**
- Location: `src/preload.ts`
- Triggers: Loaded by `BrowserWindow` before renderer scripts
- Responsibilities: Expose IPC transport API to renderer via `contextBridge`

**Renderer (`src/renderer.tsx`):**
- Location: `src/renderer.tsx`
- Triggers: Loaded by `index.html` as module script
- Responsibilities: React root creation, mounts `<App />`

**App Component (`src/app.tsx`):**
- Location: `src/app.tsx`
- Triggers: Rendered by `src/renderer.tsx`
- Responsibilities: Provides `RuntimeProvider` and `RouterProvider`

## Error Handling

**Strategy:** Effect-TS typed errors with tagged union discrimination

**Patterns:**
- CLI errors are three tagged types (`ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`) combined into `ClaudeCliErrorSchema`
- RPC transport errors are mapped to `ClaudeCliSpawnError` via `mapRpcError` in `src/services/claude-rpc/client.ts`
- `useClaudeChat` catches all errors via `Effect.catchAll`, formats them with `formatClaudeCliError()`, and sets error state
- Non-zero CLI exit codes trigger `ClaudeCliProcessError` with captured stderr
- JSON parse failures on individual stdout lines trigger `ClaudeCliParseError`

## Cross-Cutting Concerns

**Logging:**
- Effect structured logging with annotations: `service`, `operation`, `clientId`, `sessionId`
- `DevLogger` (pretty format) when `app.isPackaged === false`; `ProdLogger` (none) in production
- Console logging for lifecycle events (guarded by `!app.isPackaged`)

**Validation:**
- All data crossing boundaries (CLI output, RPC payloads, params) is validated via Effect Schema
- `ClaudeEvent` uses `Schema.Union` with a catch-all `UnknownEvent` as the last member
- Param classes use `Schema.Class` for construction-time validation

**IPC Security:**
- `contextBridge.exposeInMainWorld` isolates renderer from Node.js APIs
- Only two IPC channels exposed: `rpc:fromClient` and `rpc:fromServer`
- Electron Fuses enabled at package time: `RunAsNode: false`, `EnableNodeOptionsEnvironmentVariable: false`, `OnlyLoadAppFromAsar: true`

---

*Architecture analysis: 2026-03-25*
