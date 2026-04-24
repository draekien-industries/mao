<!-- GSD:project-start source:PROJECT.md -->

## Project

**Mao — Data Persistence**

A local data persistence layer for the Mao Electron app, which manages multiple Claude CLI sessions in parallel tabs. Uses event sourcing with SQLite to store each complete CLI event as a row, enabling full chat state reconstruction when the user quits and reopens the app.

**Core Value:** Users can close the app and resume exactly where they left off — every tab, every conversation, fully restored from persisted events.

### Constraints

- **Tech stack**: Must use Effect-TS service/layer patterns consistent with existing architecture
- **Local only**: Database must be stored on the user's filesystem (Electron `app.getPath('userData')`)
- **No partial data**: Chunked stream messages must be fully assembled before writing; terminated sessions must not leave partial rows
- **Performance**: Writes should not block the UI or slow down CLI stream processing
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.9.3 - All source code (main process, preload, renderer)
- CSS (Tailwind v4) - Styling via `src/index.css`
- JSON - Configuration files

## Runtime

- Electron 41.0.3 (Chromium + Node.js)
- Node.js v24.13.1 (host development environment)
- npm 11.8.0
- Lockfile: `package-lock.json` (present)

## Frameworks

- React 19.2.4 - UI framework (renderer process)
- Effect 3.21.0 - Functional effect system for services, error handling, streams, and dependency injection
- Electron 41.0.3 - Desktop application shell
- TanStack Router 1.168.2 - File-based routing with hash history (required for Electron)
- TanStack React Form 1.28.5 - Form state management
- shadcn/ui 4.1.0 - Component primitives (base-maia style, neutral base color)
- Tailwind CSS 4.2.2 - Utility-first CSS
- Vitest 4.1.1
- Vite 8.0.1 - Bundler (main, preload, and renderer processes)
- Electron Forge 7.11.1 - Build/package/publish pipeline
- React Compiler - via `babel-plugin-react-compiler` 1.0.0 + `@rolldown/plugin-babel` 0.2.2
- Biome 2.4.8
- Lefthook 2.1.4

## Key Dependencies

- `effect` 3.21.0 - Core functional programming library; used for service definitions (Context.Tag), error types (Schema.TaggedError), data schemas (Schema.Class), streams, layers, and managed runtimes
- `@effect/platform` 0.96.0 - Cross-platform abstractions (Command, CommandExecutor for spawning CLI processes)
- `@effect/platform-node` 0.106.0 - Node.js implementation of platform services
- `@effect/rpc` 0.75.0 - RPC framework for typed communication between Electron main and renderer processes
- `@effect/language-service` 0.83.1 - TypeScript language service plugin for Effect
- `electron-squirrel-startup` 1.0.1 - Windows installer integration (Squirrel.Windows)
- `@electron-forge/maker-squirrel` 7.11.1 - Windows (Squirrel) installer
- `@electron-forge/maker-zip` 7.11.1 - macOS zip archive
- `@electron-forge/maker-rpm` 7.11.1 - Linux RPM package
- `@electron-forge/maker-deb` 7.11.1 - Linux Debian package

## Configuration

- Single `tsconfig.json` at project root (no multi-tsconfig split)
- Target: ESNext, Module: ESNext, moduleResolution: bundler
- Strict mode enabled, noImplicitAny enabled
- Path alias: `@/*` maps to `./src/*`
- Plugins: `@effect/language-service`
- `vite.main.config.mts` - Main process (entry: `src/main.ts`), `@/` alias only
- `vite.preload.config.mts` - Preload script (entry: `src/preload.ts`), `@/` alias only
- `vite.renderer.config.mts` - Renderer process, includes TanStack Router plugin, Tailwind plugin, React plugin, Babel/React Compiler preset, `@/` alias
- `forge.config.ts` - ASAR packaging enabled, Electron Fuses configured for security
- Fuses: RunAsNode disabled, CookieEncryption enabled, NodeOptions disabled, CLI inspect disabled, ASAR integrity enabled, LoadAppFromAsar only
- `biome.json` - Excludes `src/components/ui` from linting (shadcn generated components)
- JavaScript globals: `MAIN_WINDOW_VITE_DEV_SERVER_URL`, `MAIN_WINDOW_VITE_NAME`

## Scripts

- `npm start` - `electron-forge start` (dev mode)
- `npm run package` - `electron-forge package`
- `npm run make` - `electron-forge make` (create distributable)
- `npm run publish` - `electron-forge publish`
- `npm run lint` / `lint:write` - Biome lint
- `npm run format` / `format:write` - Biome format
- `npm run check` / `check:write` - Biome check (lint + format)
- `npm run typecheck` - `tsc --noEmit`
- `npm test` - `vitest run` (single run)
- `npm run test:watch` - `vitest` (watch mode)

## Platform Requirements

- Node.js 24+ (based on host environment)
- npm 11+
- `CLAUDE_CODE_OAUTH_TOKEN` env var set before `npm start` (generate via `claude setup-token`; the SDK bundles its own `claude` binary — no PATH install required)
- Windows (Squirrel installer)
- macOS (ZIP archive)
- Linux (DEB / RPM packages)
- Electron 41 runtime (bundled)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Use `kebab-case` for all file names: `use-claude-chat.ts`, `debug-event-panel.tsx`, `service-definition.ts`
- React component files use `.tsx` extension; pure logic files use `.ts`
- Test files live in a `__tests__/` subdirectory and use `{name}.test.ts` format
- Route files follow TanStack Router conventions: `__root.tsx`, `index.tsx` inside `src/routes/`
- Generated files use `.gen.ts` suffix: `routeTree.gen.ts`
- Use `camelCase` for all functions and methods: `buildArgs`, `buildStream`, `createWindow`, `sendMessage`
- React hooks use `use` prefix: `useClaudeChat`, `useRuntime`, `useIsMobile`
- React components use `PascalCase` function declarations: `function IndexComponent()`, `function RootComponent()`
- Type guard functions use `is` prefix: `isSystemInit`, `isStreamEvent`, `isTextDelta`
- Effect generators use `Effect.gen(function* () { ... })` pattern consistently
- Use `camelCase` for local variables and parameters: `sessionIdRef`, `stderrFiber`, `mockProcess`
- Use `PascalCase` for Effect Layer/Service/Schema values: `ClaudeCliLive`, `BaseLayer`, `ServerLayer`, `ElectronServerProtocol`
- Use `UPPER_SNAKE_CASE` for module-level string constants: `RPC_FROM_CLIENT`, `RPC_FROM_SERVER`, `MOBILE_BREAKPOINT`
- Refs use `Ref` suffix: `messagesEndRef`, `scrollRafRef`, `sessionIdRef`, `isStreamingRef`
- Use `PascalCase` for all types, interfaces, and classes: `ChatMessage`, `ClaudeEvent`, `QueryParams`
- Effect Schema classes use `PascalCase` with descriptive names: `SystemInitEvent`, `ContentBlockDeltaApiEvent`
- Error classes use `Error` suffix: `ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`
- Effect Context Tags use `PascalCase` matching the class name: `ClaudeCli`, `RpcServer.Protocol`
- Union schema types export both the schema constant and a type alias with the same name:

## Code Style

- Tool: Biome v2.4.8 (`biome.json`)
- Indent: 2 spaces
- Line width: 80 characters
- Line ending: LF
- Quote style: double quotes
- Bracket spacing: enabled
- Attribute position: auto
- Tool: Biome v2.4.8 (not ESLint)
- `noExplicitAny`: warn (not error)
- `noNonNullAssertion`: warn (not error)
- `noCommonJs`: error (ESM only)
- `noInferrableTypes`: error (no redundant type annotations)
- `useConst`: error (prefer `const` over `let` in TS files)
- `noVar`: error (use `const`/`let` only)
- `noEmptyBlockStatements`: error
- `noUnusedVariables`: error
- Biome assist actions enabled: `organizeImports`, `useSortedAttributes`, `useSortedInterfaceMembers`, `useSortedProperties`
- CSS parser configured for Tailwind directives
- Tool: Lefthook (`lefthook.yml`)
- Runs `biome check --write` on staged `*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}` files
- Automatically stages fixed files

## Project-Level Code Rules (from CLAUDE.md)

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type unless absolutely necessary. For complex types use `ReturnType`, `Parameters`, etc.
- AVOID `useCallback`, `useMemo`, and `memo` for React. Depend on the React Compiler to handle memoization.

## Import Organization

- `@/*` maps to `./src/*` (configured in `tsconfig.json` and all vite configs)
- Use named imports exclusively: `import { Effect, Stream } from "effect"`
- Use `import type` for type-only imports: `import type { Stream } from "effect"`, `import type { ClaudeCliError } from "./errors"`
- Default exports used only for React page components (`export default App`) and config files
- Services and utilities use named exports

## TypeScript Configuration

- `strict: true` enabled
- `noImplicitAny: true`
- `allowJs: false` (TypeScript only)
- `target: ESNext`, `module: ESNext`
- `moduleResolution: bundler`
- `experimentalDecorators: true`
- `@effect/language-service` plugin enabled for Effect-aware IDE support
- Single `tsconfig.json` at root (no split configs per Electron process)

## Error Handling

- Define errors as `Schema.TaggedError` classes in a dedicated `errors.ts` file per service
- Each error has a `_tag` discriminant for pattern matching
- Group error types into a union schema: `ClaudeCliErrorSchema = Schema.Union(...)`
- Export both the schema and the inferred type: `type ClaudeCliError = Schema.Schema.Type<typeof ClaudeCliErrorSchema>`
- Provide a `format*Error` function for user-facing messages using exhaustive `switch` on `_tag`:
- Use `Effect.mapError` to wrap platform errors into domain error types
- Use `Effect.tapError` for logging before error propagation
- Use `Effect.catchAll` in React hooks to convert errors to UI state
- Use `Effect.either` in tests to inspect error cases without throwing
- Store error messages in component state: `const [error, setError] = useState<string | null>(null)`
- Use `Effect.catchAll` in fire-and-forget Effect programs to capture errors into state

## Logging

- Use structured logging with annotations: `Effect.annotateLogs("key", value)`
- Define annotation keys as a typed constant object in `src/services/diagnostics.ts`:
- Use `Logger.pretty` for development, `Logger.none` for production
- Annotate all service operations with `annotations.service` for filtering
- Use `Effect.logInfo`, `Effect.logDebug`, `Effect.logWarning`, `Effect.logError` — never raw `console.log`
- Exception: lifecycle logging in `src/main.ts` uses `console.log` with `[mao:lifecycle]` prefix, guarded by `!app.isPackaged`

## Comments

- Inline comments for non-obvious behavior: `// Catchall — must be last`, `// session_id is required for resume; maps to --resume (not --session-id)`
- Section-separating comments for logical groups within a file: `// API streaming events`, `// Top-level CLI stream-json events`
- Comments explaining "why" a design decision was made, not "what" the code does
- Not used in this codebase. Inline comments preferred.

## React Patterns

- Use function declarations for components (not arrow functions): `function IndexComponent() { ... }`
- Export components as named exports from route files via `Route` constant
- UI components from shadcn use `@base-ui/react` primitives with `class-variance-authority` for variants
- Use `cn()` utility (from `@/lib/utils`) for conditional class merging
- Local state via `useState` for UI concerns
- `useRef` for mutable values that should not trigger re-renders (e.g., `eventsRef`, `sessionIdRef`, `isStreamingRef`)
- Effect `ManagedRuntime` for service layer access via React Context (`src/services/claude-rpc/runtime.ts`)
- No global state library — state is scoped to components and hooks
- Encapsulate complex Effect programs in custom hooks: `useClaudeChat` in `src/hooks/use-claude-chat.ts`
- Return plain objects with state and action functions
- Use `runtime.runFork(program)` for fire-and-forget Effect execution from hooks

## Effect-TS Patterns

- Define services as `Context.Tag` classes in a `service-definition.ts` file:
- Implement services as `Layer.effect(Tag, Effect.gen(...))` in a `service.ts` file
- Export the layer as `*Live`: `ClaudeCliLive`
- Use `Schema.Class` for data types: `class Usage extends Schema.Class<Usage>("Usage")({ ... }) {}`
- Use `Schema.TaggedError` for error types
- Use `Schema.Union` for discriminated unions
- Use `Schema.is(SchemaClass)` to create type guard functions
- Use `Schema.parseJson(SchemaClass)` for JSON string decoding
- Compose layers with `Layer.provideMerge` and `Layer.provide`
- Use `ManagedRuntime.make(layer)` for long-lived runtimes (Electron main process and renderer)
- Use `Effect.scoped` for resource-bounded operations
- Use `Effect.forkScoped` for fibers tied to a scope's lifetime

## Testing Patterns

- Never use `vi.mock`, `vi.fn`, or `vi.spyOn` — mock dependencies via `Layer.succeed(Tag, mockImpl) as any`
- Never import `electron` or native modules (`better-sqlite3`) in test-reachable code — Electron rebuilds native binaries for its own Node ABI, which differs from the system Node ABI used by vitest
- For database service tests, mock `SqlClient.SqlClient` with an `unsafe` handler that tracks calls and returns canned results
- Use `Effect.either` to inspect error types in tests without throwing
- Use `Effect.scoped` when testing layers that manage resources

## Module Design

- Services: named exports for the Tag, the Live layer, and helper functions
- Schemas: named exports for each class and the union, plus type aliases and type guards
- React components: named exports for reusable components, default export for App component only
- Constants: named exports
- Not used. Import directly from the specific file.
- `service-definition.ts` — Effect Context.Tag (interface/contract)
- `service.ts` — Layer implementation
- `errors.ts` — TaggedError classes and error union
- `events.ts` — Schema classes for events/data
- `params.ts` — Schema classes for input parameters
- `__tests__/` — Test files mirroring source file names
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Pattern Overview

- Three Electron processes: main, preload, renderer — each with its own Vite build target
- Effect-TS service/layer architecture for dependency injection and streaming
- `@effect/rpc` provides type-safe RPC over Electron IPC, bridging main<->renderer
- TanStack Router (file-based, hash history) for renderer-side routing
- React 19 with React Compiler (via Babel plugin) for the UI layer

## Process Model

- Entry point for Electron; creates `BrowserWindow`, manages app lifecycle
- Builds an Effect `ManagedRuntime` from composed layers: `NodeContext` -> `ClaudeCliLive` -> `ClaudeRpcHandlers`
- Starts the RPC server on `app.on("ready")` via `runtime.runFork(startRpcServer)`
- Disposes the runtime gracefully on `app.on("before-quit")`
- Logging: `DevLogger` (pretty) in dev, `ProdLogger` (none) in production, selected via `app.isPackaged`
- Thin bridge — exposes `window.electronAPI.rpc.send()` and `window.electronAPI.rpc.onMessage()` via `contextBridge`
- Uses two IPC channels: `rpc:fromClient` (renderer->main) and `rpc:fromServer` (main->renderer)
- No business logic; purely transport
- React 19 app mounted on `#root`
- Creates its own `ManagedRuntime` (`AppRuntime`) from `ClaudeCliFromRpc` layer
- Provides `AppRuntime` via React context (`RuntimeProvider`), consumed by hooks via `useRuntime()`

## Layers

- Purpose: Provides platform services (filesystem, command executor, etc.) to the main process
- Location: External dependency, composed in `src/main.ts`
- Used by: `ClaudeCliLive` (needs `CommandExecutor`)
- Purpose: Implements the `ClaudeCli` service by spawning `claude` CLI child processes
- Location: `src/services/claude-cli/service.ts`
- Contains: Process spawning, stdout JSON stream parsing, stderr collection, exit code checking
- Depends on: `CommandExecutor` from `@effect/platform`
- Used by: `ClaudeRpcHandlers` (main process server-side)
- Purpose: Wraps `ClaudeCli` as RPC handler layer, making it callable over IPC
- Location: `src/services/claude-rpc/server.ts`
- Contains: `ClaudeRpcGroup.toLayer(...)` — maps the RPC group to the CLI service
- Depends on: `ClaudeCli`
- Used by: `RpcServer.make(ClaudeRpcGroup)` inside `startRpcServer`
- Purpose: Provides `ClaudeCli` in the renderer by proxying calls over IPC to the main process
- Location: `src/services/claude-rpc/client.ts`
- Contains: `RpcClient.make(ClaudeRpcGroup)` wrapped as a `ClaudeCli` layer
- Depends on: `ElectronClientProtocol` (IPC transport), `window.electronAPI`
- Used by: `AppRuntime` in `src/services/claude-rpc/runtime.ts`
- Purpose: Structured log annotations and logger configuration
- Location: `src/services/diagnostics.ts`
- Contains: Annotation keys (`service`, `operation`, `clientId`, `sessionId`), `DevLogger`, `ProdLogger`
- Used by: All main-process service code

## Data Flow

- React `useState` for UI state (messages, streaming text, error, debug panel)
- `useRef` for non-rendering state (session ID, event log, streaming guard)
- Effect `ManagedRuntime` for service dependencies (one per process)
- No global state store — state is local to `useClaudeChat` hook

## Key Abstractions

- Purpose: Abstract interface for interacting with Claude CLI — decoupled from transport
- Pattern: Effect `Context.Tag` with three streaming methods: `query`, `resume`, `cont`
- Two implementations: `ClaudeCliLive` (main process, spawns processes) and `ClaudeCliFromRpc` (renderer, proxies over IPC)
- Purpose: Defines the RPC contract (schema for payloads, success types, errors)
- Pattern: `RpcGroup.make(...)` with three streaming RPCs
- Used by both server (`ClaudeRpcGroup.toLayer(...)`) and client (`RpcClient.make(ClaudeRpcGroup)`)
- Purpose: Type-safe representation of all Claude CLI `stream-json` output events
- Pattern: Effect `Schema.Union` of tagged class schemas with type guards for narrowing
- Members: `SystemInitEvent`, `SystemRetryEvent`, `StreamEventMessage`, `AssistantMessageEvent`, `ResultEvent`, `UnknownEvent`
- Purpose: Schema-validated parameters that also encode CLI flag mappings
- Pattern: `Schema.Class` with static `flagMap` and `commandFlags` for building CLI args
- Classes: `QueryParams`, `ResumeParams`, `ContinueParams`
- Purpose: Typed error hierarchy for CLI operations
- Pattern: `Schema.TaggedError` union — `ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`
- Includes `formatClaudeCliError()` for human-readable messages

## Entry Points

- Location: `src/main.ts`
- Triggers: Electron app launch
- Responsibilities: Window creation, runtime lifecycle, RPC server startup
- Location: `src/preload.ts`
- Triggers: Loaded by `BrowserWindow` before renderer scripts
- Responsibilities: Expose IPC transport API to renderer via `contextBridge`
- Location: `src/renderer.tsx`
- Triggers: Loaded by `index.html` as module script
- Responsibilities: React root creation, mounts `<App />`
- Location: `src/app.tsx`
- Triggers: Rendered by `src/renderer.tsx`
- Responsibilities: Provides `RuntimeProvider` and `RouterProvider`

## Error Handling

- CLI errors are three tagged types (`ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`) combined into `ClaudeCliErrorSchema`
- RPC transport errors are mapped to `ClaudeCliSpawnError` via `mapRpcError` in `src/services/claude-rpc/client.ts`
- `useClaudeChat` catches all errors via `Effect.catchAll`, formats them with `formatClaudeCliError()`, and sets error state
- Non-zero CLI exit codes trigger `ClaudeCliProcessError` with captured stderr
- JSON parse failures on individual stdout lines trigger `ClaudeCliParseError`

## Cross-Cutting Concerns

- Effect structured logging with annotations: `service`, `operation`, `clientId`, `sessionId`
- `DevLogger` (pretty format) when `app.isPackaged === false`; `ProdLogger` (none) in production
- Console logging for lifecycle events (guarded by `!app.isPackaged`)
- All data crossing boundaries (CLI output, RPC payloads, params) is validated via Effect Schema
- `ClaudeEvent` uses `Schema.Union` with a catch-all `UnknownEvent` as the last member
- Param classes use `Schema.Class` for construction-time validation
- `contextBridge.exposeInMainWorld` isolates renderer from Node.js APIs
- Only two IPC channels exposed: `rpc:fromClient` and `rpc:fromServer`
- Electron Fuses enabled at package time: `RunAsNode: false`, `EnableNodeOptionsEnvironmentVariable: false`, `OnlyLoadAppFromAsar: true`
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->
