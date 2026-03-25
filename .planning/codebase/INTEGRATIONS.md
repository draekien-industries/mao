# External Integrations

**Analysis Date:** 2026-03-25

## APIs & External Services

**Claude CLI (Primary Integration):**
- The app spawns Anthropic's `claude` CLI as a child process using `@effect/platform` `Command` API
- Implementation: `src/services/claude-cli/service.ts`
- CLI binary: `claude` (must be installed on the user's PATH)
- Communication: JSON streaming over stdout (`--output-format stream-json`)
- Flags always passed: `--verbose`, `--include-partial-messages`
- Three operations:
  - `query` - New conversation (optional `--session-id` for session reuse)
  - `resume` - Continue existing session (`--resume <session_id>`)
  - `cont` - Continue most recent session (`--continue` flag)
- Event schema (typed with Effect Schema): `src/services/claude-cli/events.ts`
- Error types: `src/services/claude-cli/errors.ts`
- Parameter definitions: `src/services/claude-cli/params.ts`

**No other external APIs or HTTP services are used.** The app does not make any direct HTTP requests to Anthropic's API or any other service. All AI interaction is mediated through the Claude CLI binary.

## Data Storage

**Databases:**
- None. No database is used.

**File Storage:**
- Local filesystem only (via Electron)
- Claude CLI manages its own session persistence

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None. The app has no authentication system.
- Claude CLI authentication is managed externally by the Claude CLI itself (user authenticates separately via `claude login` or similar)

## IPC Communication (Internal)

**Electron IPC (Main <-> Renderer):**
- Transport: Electron `ipcMain` / `ipcRenderer` channels
- Protocol: Effect RPC (`@effect/rpc`)
- Channels: `rpc:fromClient` and `rpc:fromServer` (defined in `src/services/claude-rpc/channels.ts`)
- Server side (main process): `src/services/claude-rpc/server.ts`
  - Uses `RpcServer.Protocol.make` with Electron IPC as transport
  - Tracks connected `WebContents` by ID, handles disconnections via `Mailbox`
- Client side (renderer process): `src/services/claude-rpc/client.ts`
  - Uses `RpcClient.Protocol.make` with `window.electronAPI.rpc` bridge
- Preload bridge: `src/preload.ts` exposes `electronAPI.rpc.send()` and `electronAPI.rpc.onMessage()` via `contextBridge`
- RPC group definition: `src/services/claude-rpc/group.ts` (three streaming RPCs: query, resume, cont)
- Renderer runtime: `src/services/claude-rpc/runtime.ts` (ManagedRuntime with ClaudeCliFromRpc layer)

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logging:**
- Effect Logger system (`src/services/diagnostics.ts`)
- Dev mode: `Logger.pretty` (structured colored output to console)
- Production: `Logger.none` (logging disabled)
- Log annotations: service, operation, clientId, sessionId
- Console.log lifecycle messages in dev mode (guarded by `!app.isPackaged`)

## CI/CD & Deployment

**Hosting:**
- Desktop application (no server hosting)

**CI Pipeline:**
- None detected. No `.github/workflows/`, no CI configuration files in project root.

**Distribution:**
- Electron Forge makers configured for Windows (Squirrel), macOS (ZIP), Linux (DEB, RPM)
- `npm run make` to build distributable
- `npm run publish` to publish (no publish target configured in `forge.config.ts`)

## Environment Configuration

**Required env vars:**
- None. The application does not read any environment variables.
- `.env` is in `.gitignore` but no `.env` file exists.

**Forge-injected globals (build-time):**
- `MAIN_WINDOW_VITE_DEV_SERVER_URL` - Dev server URL (available in main process)
- `MAIN_WINDOW_VITE_NAME` - Renderer entry name (available in main process)
- Type declarations: `forge.env.d.ts`

**Secrets location:**
- No secrets are managed by this application
- Claude CLI credentials are managed externally by the CLI itself

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## External Tools / Skills

**Claude Code Skills:**
- shadcn/ui skill configuration present in `.agents/skills/shadcn/`
- Lock file: `skills-lock.json`
- These are development-time agent instructions, not runtime dependencies

---

*Integration audit: 2026-03-25*
