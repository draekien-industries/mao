---
paths:
  - "src/routes/**"
---

# Route Patterns

- Export `Route = createFileRoute("/path")({ component })` or `createRootRoute({ component })`
- This is an Electron app using hash history — do not configure browser history
- Route components that depend on `activeTabId` must use the guard pattern: outer reads atom and guards null, inner receives `tabKey` as prop — see `src/routes/index.tsx`
- No default exports — route components use named function declarations
