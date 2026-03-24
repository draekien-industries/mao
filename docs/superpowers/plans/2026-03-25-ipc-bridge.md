# IPC Bridge — Effect RPC over Electron IPC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Also read: @effect-ts skill before touching any Effect code.

**Goal:** Build an IPC bridge using `@effect/rpc` with `makeNoSerialization` so the React renderer gets typed `Stream.Stream<ClaudeEvent, ClaudeCliError>` from the same `ClaudeCli` Context.Tag interface. The app will have tabs, each running its own Claude CLI instance (N concurrent streams multiplexed by `@effect/rpc`'s requestId).

**Architecture:** `@effect/rpc`'s `makeNoSerialization` on both client and server. Electron's structured clone handles message transport. The RPC framework provides multiplexing, stream chunking, interrupt propagation, and handler lifecycle automatically. `webContents.id` serves as `clientId`. Each tab maps to one stream invocation; N tabs = N concurrent streams over a single IPC channel.

**Tech Stack:** Effect v3 (`effect`, `@effect/rpc`, `@effect/platform`, `@effect/platform-node`), Electron 41, React 19, TypeScript strict

**Spec:** `docs/superpowers/specs/2026-03-25-ipc-bridge-design.md`

---

## File Structure

**New source files:**
- `src/services/claude-rpc/group.ts` — shared `RpcGroup` definition (imported by both main and renderer)
- `src/services/claude-rpc/server.ts` — main process RPC server + IPC wiring
- `src/services/claude-rpc/client.ts` — renderer RPC client + `ClaudeCli` adapter layer
- `src/services/claude-rpc/runtime.ts` — `ManagedRuntime` + React context/hooks
- `src/preload.d.ts` — `Window.electronAPI` type declaration

**Modified:**
- `src/services/claude-cli/service-definition.ts` — rename `continue_` → `cont`
- `src/services/claude-cli/service.ts` — rename `continue_` → `cont`
- `src/services/claude-cli/__tests__/service.test.ts` — update references for rename
- `src/preload.ts` — add IPC transport bridge via `contextBridge`
- `src/main.ts` — `ManagedRuntime` setup + `startRpcServer`
- `package.json` — add `@effect/rpc` as direct dependency

No barrel `index.ts` — consumers import directly from the file they need.

---

## Steps

### Step 1: Add `@effect/rpc` as direct dependency
- [ ] Run `npm install @effect/rpc` (already transitive, making it direct)
- [ ] Verify it resolves correctly

### Step 2: Rename `continue_` → `cont`
- [ ] **`src/services/claude-cli/service-definition.ts`** — rename method in `ClaudeCli` Context.Tag interface
- [ ] **`src/services/claude-cli/service.ts`** — rename in `ClaudeCliLive` layer implementation (line 140, 144)
- [ ] **`src/services/claude-cli/__tests__/service.test.ts`** — update test references
- [ ] Run `npm run test` to verify rename doesn't break anything

### Step 3: Create shared RPC group
- [ ] **New: `src/services/claude-rpc/group.ts`**
  - `ClaudeCliErrorSchema` = `Schema.Union(ClaudeCliSpawnError, ClaudeCliParseError, ClaudeCliProcessError)`
  - `ClaudeRpcGroup` = `RpcGroup.make(...)` with three streaming RPCs: `query`, `resume`, `cont`
  - Each RPC: `{ payload: ParamSchema, success: ClaudeEvent, error: ClaudeCliErrorSchema, stream: true }`
  - Reuses existing `Schema.Class` params and `Schema.TaggedError` types from `src/services/claude-cli/`

### Step 4: Implement preload script
- [ ] **Modified: `src/preload.ts`**
  - `contextBridge.exposeInMainWorld("electronAPI", { rpc: { send, onMessage } })`
  - `send(message: unknown)` → `ipcRenderer.send("rpc:fromClient", message)`
  - `onMessage(callback)` → `ipcRenderer.on("rpc:fromServer", handler)`, returns unsubscribe function
- [ ] **New: `src/preload.d.ts`**
  - Type declaration: `Window.electronAPI.rpc: { send, onMessage }`

### Step 5: Implement main process server
- [ ] **New: `src/services/claude-rpc/server.ts`**
  - `ClaudeRpcHandlers` — `ClaudeRpcGroup.toLayer(Effect.gen(...))` delegating each RPC to existing `ClaudeCli` service
  - `startRpcServer(mainWindow, runtime)`:
    - `clients` Map: `clientId` (`webContents.id`) → `WebContents`
    - `RpcServer.makeNoSerialization(ClaudeRpcGroup, { onFromServer })` — sends responses via `webContents.send("rpc:fromServer", response)`
    - `ipcMain.on("rpc:fromClient")` → `runtime.runFork(server.write(clientId, message))`
    - `mainWindow.webContents.on("destroyed")` → cleanup `clients` map + `server.disconnect(clientId)`
    - `yield* Effect.never` at the end to keep the scope alive
- [ ] **Modified: `src/main.ts`**
  - `ServerLayer` = `Layer.provideMerge(ClaudeRpcHandlers, Layer.provideMerge(ClaudeCliLive, NodeContext.layer))`
  - `runtime` = `ManagedRuntime.make(ServerLayer)`
  - `app.on("ready")`: create window, `runtime.runFork(startRpcServer(mainWindow, runtime))`
  - `app.on("before-quit")`: `e.preventDefault()`, `await runtime.dispose()`, `app.exit(0)`

### Step 6: Implement renderer client and React runtime
- [ ] **New: `src/services/claude-rpc/client.ts`**
  - `ClaudeCliFromRpc` = `Layer.scoped(ClaudeCli, Effect.gen(...))`:
    - `RpcClient.makeNoSerialization(ClaudeRpcGroup, { onFromClient, supportsAck: false })`
    - `onFromClient({ message })` → `Effect.sync(() => window.electronAPI.rpc.send(message))`
    - `window.electronAPI.rpc.onMessage(msg => Effect.runFork(write(msg)))` — wire incoming to `clientWrite`
    - `Effect.addFinalizer(() => Effect.sync(() => unsubscribe()))` — cleanup IPC listener on scope close
    - Return adapter: `{ query: (p) => client.query(p), resume: (p) => client.resume(p), cont: (p) => client.cont(p) }`
- [ ] **New: `src/services/claude-rpc/runtime.ts`**
  - `AppRuntime` = `ManagedRuntime.make(ClaudeCliFromRpc)`
  - `RuntimeContext` = `createContext<typeof AppRuntime>(AppRuntime)`
  - Export `RuntimeProvider`, `useRuntime`

### Step 7: Structured clone proof-of-concept
- [ ] Verify full round-trip: renderer sends query request → main process streams events → exit response arrives correctly
- [ ] Test with actual Electron app running (`npm start`)
- [ ] If `Exit`/`Cause` objects fail due to stripped symbols, fall back to Protocol-based approach with `RpcSerialization.layerJson`

### Step 8: Run existing tests + typecheck
- [ ] `npm run typecheck` — no type errors
- [ ] `npm run test` — existing Claude CLI tests pass with `cont` rename
- [ ] `npm run check` — biome lint/format passes

---

## Verification

1. `npm run typecheck` passes
2. `npm run test` passes (existing tests + cont rename)
3. `npm run check` passes (biome)
4. Manual: start the app (`npm start`), verify no console errors
5. Manual: structured clone PoC — send a query, confirm stream events arrive in renderer and exit completes correctly
