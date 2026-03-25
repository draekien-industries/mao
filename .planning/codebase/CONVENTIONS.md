# Coding Conventions

**Analysis Date:** 2026-03-25

## Naming Patterns

**Files:**
- Use `kebab-case` for all file names: `use-claude-chat.ts`, `debug-event-panel.tsx`, `service-definition.ts`
- React component files use `.tsx` extension; pure logic files use `.ts`
- Test files live in a `__tests__/` subdirectory and use `{name}.test.ts` format
- Route files follow TanStack Router conventions: `__root.tsx`, `index.tsx` inside `src/routes/`
- Generated files use `.gen.ts` suffix: `routeTree.gen.ts`

**Functions:**
- Use `camelCase` for all functions and methods: `buildArgs`, `buildStream`, `createWindow`, `sendMessage`
- React hooks use `use` prefix: `useClaudeChat`, `useRuntime`, `useIsMobile`
- React components use `PascalCase` function declarations: `function IndexComponent()`, `function RootComponent()`
- Type guard functions use `is` prefix: `isSystemInit`, `isStreamEvent`, `isTextDelta`
- Effect generators use `Effect.gen(function* () { ... })` pattern consistently

**Variables:**
- Use `camelCase` for local variables and parameters: `sessionIdRef`, `stderrFiber`, `mockProcess`
- Use `PascalCase` for Effect Layer/Service/Schema values: `ClaudeCliLive`, `BaseLayer`, `ServerLayer`, `ElectronServerProtocol`
- Use `UPPER_SNAKE_CASE` for module-level string constants: `RPC_FROM_CLIENT`, `RPC_FROM_SERVER`, `MOBILE_BREAKPOINT`
- Refs use `Ref` suffix: `messagesEndRef`, `scrollRafRef`, `sessionIdRef`, `isStreamingRef`

**Types/Classes:**
- Use `PascalCase` for all types, interfaces, and classes: `ChatMessage`, `ClaudeEvent`, `QueryParams`
- Effect Schema classes use `PascalCase` with descriptive names: `SystemInitEvent`, `ContentBlockDeltaApiEvent`
- Error classes use `Error` suffix: `ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`
- Effect Context Tags use `PascalCase` matching the class name: `ClaudeCli`, `RpcServer.Protocol`
- Union schema types export both the schema constant and a type alias with the same name:
  ```typescript
  export const ClaudeEvent = Schema.Union(...);
  export type ClaudeEvent = typeof ClaudeEvent.Type;
  ```

## Code Style

**Formatting:**
- Tool: Biome v2.4.8 (`biome.json`)
- Indent: 2 spaces
- Line width: 80 characters
- Line ending: LF
- Quote style: double quotes
- Bracket spacing: enabled
- Attribute position: auto

**Linting:**
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

**Pre-commit Hook:**
- Tool: Lefthook (`lefthook.yml`)
- Runs `biome check --write` on staged `*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}` files
- Automatically stages fixed files

## Project-Level Code Rules (from CLAUDE.md)

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type unless absolutely necessary. For complex types use `ReturnType`, `Parameters`, etc.
- AVOID `useCallback`, `useMemo`, and `memo` for React. Depend on the React Compiler to handle memoization.

## Import Organization

**Order:**
1. Node built-in modules: `import path from "node:path"`
2. External packages (Effect ecosystem first, then others): `import { Effect, Stream } from "effect"`
3. Internal modules using path alias: `import { cn } from "@/lib/utils"`
4. Relative imports within the same module: `import { ClaudeCliSpawnError } from "./errors"`

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json` and all vite configs)

**Import Style:**
- Use named imports exclusively: `import { Effect, Stream } from "effect"`
- Use `import type` for type-only imports: `import type { Stream } from "effect"`, `import type { ClaudeCliError } from "./errors"`
- Default exports used only for React page components (`export default App`) and config files
- Services and utilities use named exports

## TypeScript Configuration

**Strictness:**
- `strict: true` enabled
- `noImplicitAny: true`
- `allowJs: false` (TypeScript only)
- `target: ESNext`, `module: ESNext`
- `moduleResolution: bundler`

**Special Config:**
- `experimentalDecorators: true`
- `@effect/language-service` plugin enabled for Effect-aware IDE support
- Single `tsconfig.json` at root (no split configs per Electron process)

## Error Handling

**Effect-based Errors:**
- Define errors as `Schema.TaggedError` classes in a dedicated `errors.ts` file per service
- Each error has a `_tag` discriminant for pattern matching
- Group error types into a union schema: `ClaudeCliErrorSchema = Schema.Union(...)`
- Export both the schema and the inferred type: `type ClaudeCliError = Schema.Schema.Type<typeof ClaudeCliErrorSchema>`
- Provide a `format*Error` function for user-facing messages using exhaustive `switch` on `_tag`:
  ```typescript
  export function formatClaudeCliError(err: ClaudeCliError): string {
    switch (err._tag) {
      case "ClaudeCliSpawnError":
        return `Failed to start Claude CLI: ${err.message}`;
      // ...
    }
  }
  ```

**Effect Error Mapping:**
- Use `Effect.mapError` to wrap platform errors into domain error types
- Use `Effect.tapError` for logging before error propagation
- Use `Effect.catchAll` in React hooks to convert errors to UI state
- Use `Effect.either` in tests to inspect error cases without throwing

**React Error Handling:**
- Store error messages in component state: `const [error, setError] = useState<string | null>(null)`
- Use `Effect.catchAll` in fire-and-forget Effect programs to capture errors into state

## Logging

**Framework:** Effect Logger (`effect/Logger`)

**Patterns:**
- Use structured logging with annotations: `Effect.annotateLogs("key", value)`
- Define annotation keys as a typed constant object in `src/services/diagnostics.ts`:
  ```typescript
  export const annotations = {
    service: "service",
    operation: "operation",
    clientId: "clientId",
    sessionId: "sessionId",
  } as const;
  ```
- Use `Logger.pretty` for development, `Logger.none` for production
- Annotate all service operations with `annotations.service` for filtering
- Use `Effect.logInfo`, `Effect.logDebug`, `Effect.logWarning`, `Effect.logError` — never raw `console.log`
- Exception: lifecycle logging in `src/main.ts` uses `console.log` with `[mao:lifecycle]` prefix, guarded by `!app.isPackaged`

## Comments

**When to Comment:**
- Inline comments for non-obvious behavior: `// Catchall — must be last`, `// session_id is required for resume; maps to --resume (not --session-id)`
- Section-separating comments for logical groups within a file: `// API streaming events`, `// Top-level CLI stream-json events`
- Comments explaining "why" a design decision was made, not "what" the code does

**JSDoc/TSDoc:**
- Not used in this codebase. Inline comments preferred.

## React Patterns

**Component Design:**
- Use function declarations for components (not arrow functions): `function IndexComponent() { ... }`
- Export components as named exports from route files via `Route` constant
- UI components from shadcn use `@base-ui/react` primitives with `class-variance-authority` for variants
- Use `cn()` utility (from `@/lib/utils`) for conditional class merging

**State Management:**
- Local state via `useState` for UI concerns
- `useRef` for mutable values that should not trigger re-renders (e.g., `eventsRef`, `sessionIdRef`, `isStreamingRef`)
- Effect `ManagedRuntime` for service layer access via React Context (`src/services/claude-rpc/runtime.ts`)
- No global state library — state is scoped to components and hooks

**Custom Hooks:**
- Encapsulate complex Effect programs in custom hooks: `useClaudeChat` in `src/hooks/use-claude-chat.ts`
- Return plain objects with state and action functions
- Use `runtime.runFork(program)` for fire-and-forget Effect execution from hooks

## Effect-TS Patterns

**Service Definition:**
- Define services as `Context.Tag` classes in a `service-definition.ts` file:
  ```typescript
  export class ClaudeCli extends Context.Tag("ClaudeCli")<ClaudeCli, { ... }>() {}
  ```
- Implement services as `Layer.effect(Tag, Effect.gen(...))` in a `service.ts` file
- Export the layer as `*Live`: `ClaudeCliLive`

**Schema Classes:**
- Use `Schema.Class` for data types: `class Usage extends Schema.Class<Usage>("Usage")({ ... }) {}`
- Use `Schema.TaggedError` for error types
- Use `Schema.Union` for discriminated unions
- Use `Schema.is(SchemaClass)` to create type guard functions
- Use `Schema.parseJson(SchemaClass)` for JSON string decoding

**Layers and Dependency Injection:**
- Compose layers with `Layer.provideMerge` and `Layer.provide`
- Use `ManagedRuntime.make(layer)` for long-lived runtimes (Electron main process and renderer)
- Use `Effect.scoped` for resource-bounded operations
- Use `Effect.forkScoped` for fibers tied to a scope's lifetime

## Module Design

**Exports:**
- Services: named exports for the Tag, the Live layer, and helper functions
- Schemas: named exports for each class and the union, plus type aliases and type guards
- React components: named exports for reusable components, default export for App component only
- Constants: named exports

**Barrel Files:**
- Not used. Import directly from the specific file.

**File Organization per Service:**
- `service-definition.ts` — Effect Context.Tag (interface/contract)
- `service.ts` — Layer implementation
- `errors.ts` — TaggedError classes and error union
- `events.ts` — Schema classes for events/data
- `params.ts` — Schema classes for input parameters
- `__tests__/` — Test files mirroring source file names

---

*Convention analysis: 2026-03-25*
