---
paths:
  - "src/components/**"
---

# Component Patterns

- Do not manually edit files in `src/components/ui/` — these are shadcn-generated; use the shadcn CLI to update
- Guard components for null `activeTabId`: outer component reads atom + returns placeholder if null, inner component receives `tabKey={String(activeTabId)}` as prop — never call atom families with a possibly-null key
- Atom hooks: `useAtomValue(atom)` for reads, `useAtomSet(actionAtom)` for dispatching actions
- Icons: import definitions from `@hugeicons/core-free-icons`, render with `<HugeiconsIcon icon={IconDef} />` from `@hugeicons/react`
- Dialogs are controlled: `open` + `onOpenChange` props, parent manages state with `useState`
