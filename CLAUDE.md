<code-style>

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type unless absolutely necessary. For complex types use the built in type helpers such as `ReturnType`, `Parameters`, etc.
- AVOID `useCallback`, `useMemo` and `memo` for React. Depend on the react compiler to handle this.

</code-style>

<env>

- `CLAUDE_CODE_OAUTH_TOKEN` — required at runtime; generate once with `claude setup-token` and export it in your shell or add to a local `.env` (gitignored)

</env>

<hints>

- When working with React UI components, reference the `shadcn` skills
- When working with Effect JS, reference the `effect-ts` skills

</hints>

<rules>

- Run `npm run check:write` after you make a change and resolve any issues.
- Run `npm run typecheck` after you make a change and resolve any issues.
- Run `npm test` after you finish implementation to check if you have introduced any regressions.

</rules>

<logging>

- Include sensible diagnostic logs that can be used to debug workflows during development
- Ensure all errors are logged at some point in the Effect runtime
- Use Effect logger where appropriate, otherwise the `devLog` helper

</logging>
