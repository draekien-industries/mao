<code-style>

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type unless absolutely necessary. For complex types use the built in type helpers such as `ReturnType`, `Parameters`, etc.
- AVOID `useCallback`, `useMemo` and `memo` for React. Depend on the react compiler to handle this.

</code-style>

<hints>

- When working with React UI components, reference the `shadcn` skills
- When working with Effect JS, reference the `effect-ts` skills
- When using `gsd` plugin, reference [GSD CLAUDE.md](./.planning/CLAUDE.md)

</hints>

<rules>

- Run `npm run check:write` after you make a change and resolve any issues.
- Run `npm run typecheck` after you make a change and resolve any issues.
- Run `npm test` after you finish implementation to check if you have introduced any regressions.

</rules>
