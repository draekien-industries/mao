---
paths:
  - "src/services/**"
---

# Service Patterns

- `Context.Tag` string must be globally unique — check existing tags before adding a new one
- Export a factory function `make*Live()` returning the Layer, not the Layer directly
- Every method: `Effect.tapError` for logging, then `Effect.mapError` to domain `TaggedError`
- Annotate every method with `Effect.annotateLogs(annotations.operation, "methodName")`
- Annotate layer construction with `Effect.annotateLogs(annotations.service, "service-name")`
- Return `ReadonlyArray<T>` from collection methods, `Option.Option<T>` from single-entity lookups
