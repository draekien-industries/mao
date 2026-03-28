---
paths:
  - "src/**/__tests__/**"
---

# Test Patterns

- Atom tests: use `Registry.make()` for isolated state — `registry.get(atom)` to read, `registry.set(atom, value)` to write
- Service tests: `Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped))`
- Database mocks: build in-memory mock with tagged template handler that pattern-matches SQL strings; include `withTransaction: (self) => self` passthrough — see `project-store/__tests__/service.test.ts`
- Never import `electron` or `better-sqlite3` in test-reachable code — Electron rebuilds native binaries for its own Node ABI; vitest uses system Node
- Error assertions: wrap in `Effect.either`, assert `Either.isLeft`, inspect error `_tag`
