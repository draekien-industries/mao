# Codebase Structure

**Analysis Date:** 2026-03-25

## Directory Layout

```
mao/
├── src/
│   ├── components/
│   │   ├── ui/              # Shadcn/UI primitives (button, input, sidebar, etc.)
│   │   └── debug-event-panel.tsx  # App-level debug component
│   ├── hooks/
│   │   ├── use-claude-chat.ts     # Core chat state + streaming logic
│   │   └── use-mobile.ts          # Responsive breakpoint hook
│   ├── lib/
│   │   ├── router.ts              # TanStack Router instance (hash history)
│   │   └── utils.ts               # cn() classname utility
│   ├── routes/
│   │   ├── __root.tsx             # Root layout (full-height wrapper + devtools)
│   │   └── index.tsx              # Chat page (main UI)
│   ├── services/
│   │   ├── claude-cli/
│   │   │   ├── __tests__/         # Unit tests for CLI service modules
│   │   │   ├── errors.ts          # Tagged error types + formatter
│   │   │   ├── events.ts          # ClaudeEvent schema union + type guards
│   │   │   ├── params.ts          # Query/Resume/Continue param schemas + flag maps
│   │   │   ├── service.ts         # ClaudeCliLive implementation (process spawning)
│   │   │   └── service-definition.ts  # ClaudeCli Context.Tag interface
│   │   ├── claude-rpc/
│   │   │   ├── channels.ts        # IPC channel name constants
│   │   │   ├── client.ts          # Renderer-side RPC client + ClaudeCliFromRpc layer
│   │   │   ├── group.ts           # RPC group definition (contract)
│   │   │   ├── runtime.ts         # AppRuntime + React context provider
│   │   │   └── server.ts          # Main-process RPC server + protocol
│   │   └── diagnostics.ts         # Logger config + annotation keys
│   ├── main.ts                    # Electron main process entry
│   ├── preload.ts                 # Preload script (IPC bridge)
│   ├── renderer.tsx               # React DOM entry
│   ├── app.tsx                    # Root React component (runtime + router providers)
│   ├── index.css                  # Global styles (Tailwind)
│   ├── index.d.ts                 # Global Window.electronAPI type augmentation
│   ├── routeTree.gen.ts           # Auto-generated route tree (TanStack Router plugin)
│   └── vite-env.d.ts              # Vite client type reference
├── docs/                          # Documentation
│   └── superpowers/               # Feature specs and plans
├── .planning/                     # GSD planning artifacts
│   └── codebase/                  # Codebase analysis documents
├── .agents/                       # Agent skill definitions
│   └── skills/shadcn/             # Shadcn skill files
├── .claude/                       # Claude CLI configuration
│   └── skills/                    # Claude Code skill files
├── index.html                     # Renderer HTML shell (loads src/renderer.tsx)
├── forge.config.ts                # Electron Forge config (makers, plugins, fuses)
├── forge.env.d.ts                 # Forge/Vite env type reference
├── vite.main.config.mts           # Vite config for main process build
├── vite.preload.config.mts        # Vite config for preload script build
├── vite.renderer.config.mts       # Vite config for renderer build (React, Tailwind, Router)
├── vitest.config.mts              # Vitest test runner config
├── tsconfig.json                  # Single shared TypeScript config
├── biome.json                     # Biome linter/formatter config
├── lefthook.yml                   # Git hooks config
├── components.json                # Shadcn component registry config
└── package.json                   # Project manifest
```

## Directory Purposes

**`src/components/ui/`:**
- Purpose: Shadcn/UI primitive components
- Contains: `button.tsx`, `input.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `skeleton.tsx`, `tooltip.tsx`, `sheet.tsx`, `sidebar.tsx`
- Key pattern: Each file exports a single component (or set of related subcomponents). Managed via the `shadcn` CLI tool.

**`src/components/`:**
- Purpose: Application-level reusable components (not Shadcn primitives)
- Contains: `debug-event-panel.tsx`
- Key pattern: Components that compose UI primitives with app-specific logic

**`src/hooks/`:**
- Purpose: Custom React hooks
- Contains: `use-claude-chat.ts` (core chat logic), `use-mobile.ts` (responsive helper)
- Key pattern: Hooks that bridge Effect runtime with React state

**`src/lib/`:**
- Purpose: Non-React utility modules
- Contains: `router.ts` (TanStack Router instance), `utils.ts` (className helper)
- Key pattern: Shared infrastructure used across the renderer

**`src/routes/`:**
- Purpose: File-based route definitions for TanStack Router
- Contains: `__root.tsx` (root layout), `index.tsx` (home/chat page)
- Key pattern: Each file exports a `Route` created via `createFileRoute()` or `createRootRoute()`
- Auto-generates: `src/routeTree.gen.ts`

**`src/services/claude-cli/`:**
- Purpose: Claude CLI integration — spawning, parsing, error handling
- Contains: Service definition, implementation, event schemas, param schemas, error types
- Key files:
  - `service-definition.ts`: The abstract `ClaudeCli` tag (interface)
  - `service.ts`: `ClaudeCliLive` layer (main process implementation)
  - `events.ts`: All Claude CLI event schemas and type guards
  - `params.ts`: Parameter schemas with CLI flag mapping
  - `errors.ts`: Tagged error types
- Tests: `__tests__/service.test.ts`, `__tests__/events.test.ts`, `__tests__/params.test.ts`

**`src/services/claude-rpc/`:**
- Purpose: RPC transport layer bridging main and renderer processes
- Contains: RPC group contract, server protocol, client protocol, runtime context
- Key files:
  - `group.ts`: `ClaudeRpcGroup` — the shared RPC contract
  - `server.ts`: Main-process RPC server with `ElectronServerProtocol`
  - `client.ts`: Renderer-side RPC client with `ElectronClientProtocol`, exports `ClaudeCliFromRpc`
  - `runtime.ts`: `AppRuntime` (ManagedRuntime) and React context
  - `channels.ts`: IPC channel name constants

**`src/services/`:**
- Purpose: All backend/domain service code
- Contains: `diagnostics.ts` (logging utilities) + subdirectories for each service domain

## Key File Locations

**Entry Points:**
- `src/main.ts`: Electron main process — app lifecycle, window creation, runtime + RPC server
- `src/preload.ts`: Preload script — IPC bridge via `contextBridge`
- `src/renderer.tsx`: React DOM entry — creates root, renders `<App />`
- `src/app.tsx`: Root React component — provides runtime context and router

**Configuration:**
- `tsconfig.json`: Single TypeScript config for all three build targets
- `forge.config.ts`: Electron Forge build/packaging config
- `vite.main.config.mts`: Vite config for main process
- `vite.preload.config.mts`: Vite config for preload script
- `vite.renderer.config.mts`: Vite config for renderer (includes React, Tailwind, TanStack Router plugins)
- `biome.json`: Linter and formatter
- `vitest.config.mts`: Test runner
- `components.json`: Shadcn component registry

**Core Logic:**
- `src/services/claude-cli/service.ts`: CLI process spawning and stream parsing
- `src/services/claude-cli/events.ts`: Event schema definitions (the data model)
- `src/services/claude-rpc/server.ts`: Main-process RPC server
- `src/services/claude-rpc/client.ts`: Renderer-process RPC client
- `src/hooks/use-claude-chat.ts`: React hook orchestrating chat state + Effect streams

**Testing:**
- `src/services/claude-cli/__tests__/service.test.ts`: CLI service unit tests
- `src/services/claude-cli/__tests__/events.test.ts`: Event schema tests
- `src/services/claude-cli/__tests__/params.test.ts`: Param building tests

## Naming Conventions

**Files:**
- `kebab-case.ts` / `kebab-case.tsx` for all source files
- `use-*.ts` prefix for React hooks
- `*.test.ts` for test files (co-located in `__tests__/` subdirectory)
- `*.gen.ts` suffix for auto-generated files (e.g., `routeTree.gen.ts`)
- `__root.tsx` for TanStack Router root layout (framework convention)

**Directories:**
- `kebab-case` for all directories
- `__tests__/` for test directories (co-located with source)
- `ui/` specifically for Shadcn primitive components

**Exports:**
- React components: PascalCase named exports (e.g., `DebugEventPanel`, `Button`)
- Effect services/layers: PascalCase (e.g., `ClaudeCliLive`, `ClaudeRpcGroup`, `AppRuntime`)
- Hooks: camelCase with `use` prefix (e.g., `useClaudeChat`, `useRuntime`)
- Utilities: camelCase (e.g., `cn`, `buildArgs`, `formatClaudeCliError`)
- Constants: SCREAMING_SNAKE_CASE for IPC channels (e.g., `RPC_FROM_CLIENT`)

## Where to Add New Code

**New Route/Page:**
- Create `src/routes/<route-name>.tsx` exporting a `Route` via `createFileRoute("/<route-name>")`
- The TanStack Router plugin auto-regenerates `src/routeTree.gen.ts`
- Nested routes: `src/routes/<parent>/<child>.tsx`

**New React Component:**
- App-level component: `src/components/<component-name>.tsx`
- Shadcn UI primitive: Use `npx shadcn add <component>` (outputs to `src/components/ui/`)

**New React Hook:**
- `src/hooks/use-<hook-name>.ts`
- If it needs Effect runtime, use `useRuntime()` from `src/services/claude-rpc/runtime.ts`

**New Service (main process):**
- Define the tag/interface: `src/services/<service-name>/service-definition.ts`
- Implement the layer: `src/services/<service-name>/service.ts`
- Add to the layer composition in `src/main.ts` (merge into `BaseLayer` or `ServerLayer`)

**New RPC Method:**
- Add an `Rpc.make(...)` entry to `ClaudeRpcGroup` in `src/services/claude-rpc/group.ts`
- Implement the handler in `src/services/claude-rpc/server.ts` (via the group's `.toLayer()`)
- Expose through the client in `src/services/claude-rpc/client.ts`

**New Error Type:**
- Add a `Schema.TaggedError` class in `src/services/claude-cli/errors.ts`
- Add it to the `ClaudeCliErrorSchema` union
- Update `formatClaudeCliError()` switch

**New Event Type:**
- Add a `Schema.Class` in `src/services/claude-cli/events.ts`
- Add it to the `ClaudeEvent` union (before `UnknownEvent` — order matters)
- Optionally add a type guard via `Schema.is(...)`

**Utilities:**
- Shared helpers: `src/lib/<util-name>.ts`

**Tests:**
- Place in `src/services/<service>/__tests__/<module>.test.ts`
- For hooks/components: `src/hooks/__tests__/` or `src/components/__tests__/`

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Auto-generated route tree for TanStack Router
- Generated: Yes (by `@tanstack/router-plugin/vite` on file changes)
- Committed: Yes (checked in)
- Do not edit manually

**`.vite/`:**
- Purpose: Vite build cache and output
- Generated: Yes
- Committed: No (build artifact)

**`dist/`:**
- Purpose: TypeScript compilation output (not used directly — Vite handles bundling)
- Generated: Yes
- Committed: No

**`out/`:**
- Purpose: Electron Forge packaging output
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and analysis artifacts
- Generated: By tooling
- Committed: Yes

**`.agents/skills/`:**
- Purpose: Claude Code agent skill definitions (Shadcn patterns, etc.)
- Generated: No (manually curated)
- Committed: Yes

---

*Structure analysis: 2026-03-25*
