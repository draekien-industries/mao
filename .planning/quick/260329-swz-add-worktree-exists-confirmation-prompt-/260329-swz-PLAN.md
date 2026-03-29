---
phase: quick
plan: 260329-swz
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/create-session-dialog.tsx
autonomous: true
requirements: [D-12]
must_haves:
  truths:
    - "When user types a branch with an existing worktree and 'Create worktree' is checked, an inline message shows the existing worktree path"
    - "The submit button changes to 'Use Existing Worktree' when an existing worktree is detected"
    - "When the branch name changes or worktree checkbox is unchecked, the worktree-exists state resets"
  artifacts:
    - path: "src/components/create-session-dialog.tsx"
      provides: "Worktree-exists check and inline prompt"
      contains: "checkWorktreeExistsAtom"
  key_links:
    - from: "src/components/create-session-dialog.tsx"
      to: "src/atoms/sidebar.ts"
      via: "useAtomSet(checkWorktreeExistsAtom)"
      pattern: "checkWorktreeExistsAtom"
---

<objective>
Add an inline worktree-exists confirmation prompt to CreateSessionDialog (D-12).

Purpose: When a user enters a branch name that already has a worktree, inform them before submission so they knowingly reuse it rather than being surprised.
Output: Updated CreateSessionDialog with debounced worktree existence check, inline message, and dynamic submit button text.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/create-session-dialog.tsx
@src/atoms/sidebar.ts
@src/components/branch-autocomplete.tsx
@.claude/rules/components.md
@.claude/rules/atoms.md

<interfaces>
From src/atoms/sidebar.ts:
```typescript
// Returns { exists: true, path: string } | { exists: false, path: null }
export const checkWorktreeExistsAtom = appRuntime.fn(
  (params: { readonly cwd: string; readonly branchName: string }) =>
    Effect.gen(function* () { ... })
);

export const createSessionAtom = appRuntime.fn(
  (params: {
    readonly projectId: number;
    readonly cwd: string;
    readonly branchName: string;
    readonly useWorktree: boolean;
    readonly worktreeBasePath: string;
    readonly isGitRepo: boolean;
  }, ctx: Atom.FnContext) => ...
);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add worktree-exists check and inline prompt to CreateSessionDialog</name>
  <files>src/components/create-session-dialog.tsx</files>
  <action>
Modify CreateSessionDialog to check for existing worktrees and display an inline confirmation message:

1. **Add state for worktree check result:**
   - Add `const [worktreeCheck, setWorktreeCheck] = useState<{ exists: true; path: string } | null>(null)`
   - Import `checkWorktreeExistsAtom` from `@/atoms/sidebar`
   - Get the dispatch: `const checkWorktreeExists = useAtomSet(checkWorktreeExistsAtom)`

2. **Add a useEffect to check worktree existence when conditions are met:**
   - Trigger when `branchName`, `useWorktree`, `open`, `isGitRepo`, or `cwd` change
   - Guard: only run when `open && isGitRepo && useWorktree && branchName.length > 0`
   - If guard fails, `setWorktreeCheck(null)` and return early
   - Use a 300ms debounce via `setTimeout` + cleanup to avoid spamming checks while typing
   - Inside the timeout, call `checkWorktreeExists({ cwd, branchName })` — this is a fire-and-forget atom dispatch that returns a Promise. Await it with `.then(result => { if (result.exists) setWorktreeCheck(result); else setWorktreeCheck(null); })`. Catch errors and set null.
   - Return cleanup that clears the timeout

3. **Reset worktreeCheck on dialog close:**
   - In the existing `if (!open)` block, add `setWorktreeCheck(null)`

4. **Render inline message when worktree exists:**
   - Inside the `{isGitRepo && (...)}` block, after the existing `{useWorktree && branchName && (...)}` FieldDescription for the path preview, add:
   ```tsx
   {worktreeCheck?.exists && (
     <FieldDescription className="text-amber-600 dark:text-amber-400">
       A worktree for &apos;{branchName}&apos; already exists at {worktreeCheck.path}. It will be reused.
     </FieldDescription>
   )}
   ```

5. **Change submit button text dynamically:**
   - Derive `const worktreeExists = worktreeCheck?.exists === true` before the return
   - Update button text: `{isSubmitting ? "Creating..." : worktreeExists ? "Use Existing Worktree" : "Create Session"}`

6. **Important:** The `handleCreate` function does NOT need changes — `createSessionAtom` already handles worktree reuse correctly. This is purely a UI information change.

Run `npm run check:write`, `npm run typecheck`, and `npm test` after implementation.
  </action>
  <verify>
    <automated>npm run typecheck && npm test</automated>
  </verify>
  <done>
    - When `useWorktree` is checked and `branchName` matches an existing worktree, an amber inline message appears showing the existing path
    - The submit button reads "Use Existing Worktree" when an existing worktree is detected
    - When the branch name is cleared, worktree checkbox is unchecked, or dialog closes, the message disappears
    - No type errors, all tests pass, biome check passes
  </done>
</task>

</tasks>

<verification>
- Open the app, navigate to a project with existing worktrees
- Open "New Session" dialog, type a branch name that has an existing worktree
- Verify the amber message appears with the correct path
- Verify the button text changes to "Use Existing Worktree"
- Clear the branch name — message should disappear
- Uncheck "Create worktree" — message should disappear
- Close and reopen dialog — no stale state
</verification>

<success_criteria>
- Worktree existence check fires with 300ms debounce after branch name input
- Inline amber FieldDescription shows existing worktree path
- Submit button text changes to "Use Existing Worktree" when worktree exists
- State resets properly on branch change, checkbox toggle, and dialog close
- typecheck, biome check, and tests all pass
</success_criteria>

<output>
After completion, create `.planning/quick/260329-swz-add-worktree-exists-confirmation-prompt-/260329-swz-SUMMARY.md`
</output>
