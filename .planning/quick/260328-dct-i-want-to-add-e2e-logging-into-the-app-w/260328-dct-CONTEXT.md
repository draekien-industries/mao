# Quick Task 260328-dct: Add E2E logging into the app where it is missing - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Task Boundary

Add diagnostic logging to all services and layers in the app that currently lack it. The app is an Electron + Effect-TS application with logging infrastructure already in place (DevLogger, ProdLogger, annotations) but many modules have no actual log calls.

</domain>

<decisions>
## Implementation Decisions

### Logging Depth
- Use lifecycle + errors level: log entry/exit for key operations (create, delete, reconstruct, spawn) and all errors
- Skip per-row debug noise (e.g., don't log every individual DB read query)
- Consistent with existing patterns in claude-rpc/server.ts and claude-cli/service.ts

### Renderer-Side Logging
- Wire an Effect logger into the renderer runtime (appRuntime in atoms/runtime.ts)
- Add logging to atom actions (chat, sidebar) and the RPC client
- Prefer Effect logger; fall back to devLog helper if Effect logger can't be wired in

### Production Logging
- Keep ProdLogger as Logger.none — no changes to production logging behavior
- All new logging is dev-only, consistent with current approach

### Claude's Discretion
- Exact log messages and annotation keys for new log calls
- Whether to add new annotation keys beyond the existing set (service, operation, clientId, sessionId)

</decisions>

<specifics>
## Specific Ideas

- Follow existing patterns: use `Effect.annotateLogs` for structured context, `Effect.logInfo` for lifecycle, `Effect.logError`/`Effect.tapError` for errors
- Modules needing logging: EventStore, ProjectStore, TabStore, SessionReconstructor, GitService, git-rpc handlers, dialog service/handlers, persistence-rpc handlers, RPC client, chat atoms, sidebar atoms
- Renderer runtime needs DevLogger layer added to appRuntime

</specifics>
