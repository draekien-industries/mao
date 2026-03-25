# Testing Patterns

**Analysis Date:** 2026-03-25

## Test Framework

**Runner:**
- Vitest v4.1.1
- Config: `vitest.config.mts`
- Environment: `node` (not jsdom — tests target main process / pure logic only)

**Assertion Library:**
- Vitest built-in `expect` (Chai-compatible API)

**Run Commands:**
```bash
npm test              # Run all tests once (vitest run)
npm run test:watch    # Watch mode (vitest)
```

## Test File Organization

**Location:**
- Co-located in `__tests__/` subdirectory adjacent to source files
- Pattern: `src/services/{service}/__tests__/{name}.test.ts`

**Naming:**
- `{source-file-name}.test.ts` — matches the source file being tested
- Example: `service.ts` -> `__tests__/service.test.ts`

**Current Test Files:**
```
src/services/claude-cli/
├── __tests__/
│   ├── errors.test.ts      # Error class construction and _tag verification
│   ├── events.test.ts      # Schema decoding for all event types + type guards
│   ├── params.test.ts      # buildArgs() flag generation for all param classes
│   └── service.test.ts     # Stream pipeline integration with mock CommandExecutor
├── errors.ts
├── events.ts
├── params.ts
├── service-definition.ts
└── service.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from "vitest";

describe("ComponentOrFunction", () => {
  it("descriptive behavior statement", async () => {
    // Dynamic import of module under test
    const { ModuleExport } = await import("../module");

    // Arrange / Act / Assert
    const result = /* ... */;
    expect(result).toBe(expectedValue);
  });
});
```

**Key Patterns:**
- All test cases are `async` functions (even when not strictly needed)
- Module under test is loaded via dynamic `await import("../module")` inside each test case, not at the top of the file. This ensures clean module state per test.
- `describe` blocks group by logical unit (function name, class name, or schema type)
- `it` descriptions are specific and behavior-focused: `"minimal: only prompt -> base flags"`, `"decodes TextBlock"`, `"guards reject non-matching events"`
- No `beforeEach`/`afterEach`/`beforeAll`/`afterAll` hooks — each test is fully self-contained

**Naming Convention for `it` blocks:**
- For flag/param tests: describe the CLI flag being tested: `"--model"`, `"--bare when true"`
- For schema tests: describe the decode operation: `"decodes SystemInitEvent"`, `"UnknownEvent catches unrecognised types without error"`
- For error path tests: describe what fails: `"query() fails with ClaudeCliProcessError on non-zero exit"`

## Mocking

**Framework:** Manual mocking with Effect layers (no mocking library like `vi.mock`)

**Pattern — Mock via Layer substitution:**
```typescript
// Create a minimal mock process with typed fields
const makeMockProcess = (
  stdoutBytes: Uint8Array,
  exitCode: number,
  stderrText = "",
) =>
  ({
    stdout: Stream.make(stdoutBytes),
    stderr: Stream.make(new TextEncoder().encode(stderrText)),
    exitCode: Effect.succeed(exitCode),
  }) as any;

// Replace the real CommandExecutor with one that returns the mock process
const makeExecutorLayer = (process: ReturnType<typeof makeMockProcess>) =>
  Layer.succeed(CommandExecutor.CommandExecutor, {
    start: () => Effect.succeed(process),
  } as any);

// Provide the mock layer to the real service layer
const testLayer = ClaudeCliLive.pipe(
  Layer.provide(makeExecutorLayer(mockProcess)),
);
```

**What to Mock:**
- External process execution (`CommandExecutor`) — always mock in tests
- System I/O boundaries (stdin/stdout/stderr as Effect Streams)

**What NOT to Mock:**
- Effect Schema decoding — test real decode behavior
- Service layer composition — use real `ClaudeCliLive` with mocked dependencies
- Error types — construct and verify real error instances

**Note on `as any`:**
- Mock objects use `as any` casts for partial implementations (only the fields the code under test actually uses). This is acceptable in tests per the project's pragmatic approach, even though production code avoids `as`.

## Fixtures and Factories

**Test Data:**
```typescript
// Real CLI output serialized as JSON strings
const INIT_LINE = JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "sess_01",
  uuid: "uuid_01",
});

// Helper to encode JSON lines as UTF-8 bytes (mimics CLI stdout)
const encodeLines = (...lines: string[]): Uint8Array =>
  new TextEncoder().encode(`${lines.join("\n")}\n`);
```

**Location:**
- Fixtures are defined as module-level constants at the top of each test file
- No shared fixture directory — fixtures are local to each test file
- Helper functions (`encodeLines`, `makeMockProcess`, `makeExecutorLayer`) are defined at the top of `service.test.ts`

## Coverage

**Requirements:** Not enforced (no coverage thresholds configured in `vitest.config.mts`)

**View Coverage:**
```bash
npx vitest run --coverage    # Not configured as a script, but available via vitest
```

## Test Types

**Unit Tests:**
- Schema decoding tests (`events.test.ts`): verify each schema class decodes valid input and the union dispatches correctly
- Error construction tests (`errors.test.ts`): verify `_tag` discriminant and field access
- Function output tests (`params.test.ts`): verify `buildArgs()` produces correct CLI flag arrays for all parameter combinations

**Integration Tests:**
- Stream pipeline tests (`service.test.ts`): wire up the real `ClaudeCliLive` layer with a mock `CommandExecutor`, then run the full stream pipeline end-to-end (spawn -> stdout decode -> JSON parse -> schema decode -> collect events)
- These test the composition of multiple modules together (service, params, events, errors)

**E2E Tests:**
- Not present. No Playwright/Spectron/Electron testing configured.

**Renderer/React Tests:**
- Not present. No React component tests. The vitest environment is `node`, not `jsdom`.
- Hooks (`use-claude-chat.ts`, `use-mobile.ts`) are untested
- Route components are untested

## Common Patterns

**Async Testing with Effect:**
```typescript
it("description", async () => {
  const events = await Effect.runPromise(
    Effect.gen(function* () {
      const cli = yield* ClaudeCli;
      return yield* Stream.runCollect(
        cli.query(new QueryParams({ prompt: "Hi" })),
      );
    }).pipe(Effect.provide(testLayer), Effect.scoped),
  );

  const arr = Chunk.toArray(events);
  expect(arr).toHaveLength(3);
});
```

**Error Testing with Effect.either:**
```typescript
it("fails with ClaudeCliProcessError on non-zero exit", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const cli = yield* ClaudeCli;
      return yield* Stream.runCollect(
        cli.query(new QueryParams({ prompt: "Hi" })),
      ).pipe(Effect.either);  // Wrap in Either to inspect error without throwing
    }).pipe(Effect.provide(testLayer), Effect.scoped),
  );

  expect(result._tag).toBe("Left");
  if (result._tag === "Left") {
    expect(result.left).toBeInstanceOf(ClaudeCliProcessError);
    expect((result.left as ClaudeCliProcessError).exitCode).toBe(1);
  }
});
```

**Schema Decode Testing:**
```typescript
it("decodes SystemInitEvent", async () => {
  const { ClaudeEvent } = await import("../events");
  const raw = {
    type: "system",
    subtype: "init",
    session_id: "sess_01",
    uuid: "uuid_01",
  };
  const result = await Effect.runPromise(
    Schema.decodeUnknown(ClaudeEvent)(raw),
  );
  expect(result.type).toBe("system");
});
```

**Type Guard Testing:**
```typescript
it("isSystemInit narrows SystemInitEvent", async () => {
  const { ClaudeEvent, isSystemInit } = await import("../events");
  const event = await Effect.runPromise(
    Schema.decodeUnknown(ClaudeEvent)(raw),
  );
  expect(isSystemInit(event)).toBe(true);
  if (isSystemInit(event)) {
    expect(event.session_id).toBe("sess_01");
  }
});
```

## Test Coverage Gaps

**Untested — React/Renderer Layer:**
- `src/hooks/use-claude-chat.ts` — Core chat hook with streaming logic, session management, error display
- `src/hooks/use-mobile.ts` — Mobile breakpoint detection hook
- `src/routes/index.tsx` — Main chat UI component
- `src/routes/__root.tsx` — Root route layout
- `src/components/debug-event-panel.tsx` — Debug event visualization component
- `src/app.tsx` — App root with runtime/router providers
- `src/renderer.tsx` — React DOM mounting
- Risk: UI regressions undetectable; chat hook logic (session resumption, streaming text accumulation, error formatting) has no automated coverage
- Priority: Medium (hook logic is the highest-value target for testing)

**Untested — RPC Transport Layer:**
- `src/services/claude-rpc/server.ts` — Electron IPC server protocol, client connect/disconnect handling
- `src/services/claude-rpc/client.ts` — Electron IPC client protocol, RPC error mapping
- `src/services/claude-rpc/runtime.ts` — ManagedRuntime and React context
- `src/services/claude-rpc/group.ts` — RPC group definition (trivial, low risk)
- Risk: RPC transport errors (serialization, client lifecycle) undetectable
- Priority: Medium (the `mapRpcError` function in `client.ts` would benefit from unit tests)

**Untested — Main Process Lifecycle:**
- `src/main.ts` — Window creation, runtime disposal, lifecycle event handling
- `src/preload.ts` — Context bridge API exposure
- Risk: Low (Electron lifecycle is hard to unit test; manual testing is standard practice)
- Priority: Low

**Untested — Diagnostics:**
- `src/services/diagnostics.ts` — Logger configuration (trivial, 11 lines)
- Risk: Negligible
- Priority: Low

---

*Testing analysis: 2026-03-25*
