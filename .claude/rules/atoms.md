---
paths:
  - "src/atoms/**"
---

# Atom Patterns

- Every `Atom.family` must pipe through `Atom.keepAlive` — omitting it causes state loss on tab switch when the subscribing component unmounts
- Family keys are `string` — convert numeric tab IDs via `String(tabId)` at the call site (components), not inside atoms
- Side-effect atoms use `appRuntime.fn((params, ctx: Atom.FnContext) => Effect.gen(...))` from `./runtime`
- Inside `appRuntime.fn`: read with `ctx(atom)`, write with `ctx.set(atom, value)` — never use React hooks
- Derived/computed atoms use `Atom.make((get) => ...)` — the callback receives `get`, not `ctx`
- Global action atoms (not families) for long-running effects that span tab lifetimes — see `sendMessageAtom` in `src/atoms/chat.ts`
