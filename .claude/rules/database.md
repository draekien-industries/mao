---
paths:
  - "src/services/database/**"
---

# Database Patterns

- SQL uses tagged template literals: `` sql`SELECT ... WHERE id = ${id}` `` — never string interpolation; `sql.unsafe` only for DDL (CREATE TABLE, ALTER TABLE, PRAGMA)
- SQLite has no boolean type — use `SqliteBoolean` transform (decode: `n !== 0`, encode: `b ? 1 : 0`) in schemas with boolean columns
- Define a local `decodeX` helper using `Schema.decodeUnknown(SchemaClass)` at top of service file — see `src/services/database/project-store/service.ts`
- Cascade deletes: delete children first in explicit order, wrap with `sql.withTransaction` — see `ProjectStore.remove`
- Return `Option.none<T>()` / `Option.some(entity)` for single-entity lookups, never `null`
- Store services acquire `sql` via `const { sql } = yield* Database` at Layer construction time
