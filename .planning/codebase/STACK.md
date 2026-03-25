# Technology Stack

**Analysis Date:** 2026-03-25

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code (main process, preload, renderer)

**Secondary:**
- CSS (Tailwind v4) - Styling via `src/index.css`
- JSON - Configuration files

## Runtime

**Environment:**
- Electron 41.0.3 (Chromium + Node.js)
- Node.js v24.13.1 (host development environment)

**Package Manager:**
- npm 11.8.0
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.2.4 - UI framework (renderer process)
- Effect 3.21.0 - Functional effect system for services, error handling, streams, and dependency injection
- Electron 41.0.3 - Desktop application shell

**Routing:**
- TanStack Router 1.168.2 - File-based routing with hash history (required for Electron)
  - Plugin: `@tanstack/router-plugin` 1.167.3 (Vite integration, auto code-splitting)
  - Route tree: auto-generated at `src/routeTree.gen.ts`
  - Devtools: `@tanstack/react-router-devtools` 1.166.11 (dev-only)

**Forms:**
- TanStack React Form 1.28.5 - Form state management

**UI Component Library:**
- shadcn/ui 4.1.0 - Component primitives (base-maia style, neutral base color)
  - Config: `components.json`
  - Icon library: Hugeicons (`@hugeicons/core-free-icons` 4.0.0, `@hugeicons/react` 1.1.6)
  - Base primitives: `@base-ui/react` 1.3.0

**Styling:**
- Tailwind CSS 4.2.2 - Utility-first CSS
  - Vite plugin: `@tailwindcss/vite` 4.2.2
  - `tw-animate-css` 1.4.0 - Animation utilities
  - `class-variance-authority` 0.7.1 - Variant-based component styling
  - `clsx` 2.1.1 + `tailwind-merge` 3.5.0 - Class merging via `cn()` helper at `src/lib/utils.ts`

**Testing:**
- Vitest 4.1.1
  - Config: `vitest.config.mts`
  - Environment: node

**Build/Dev:**
- Vite 8.0.1 - Bundler (main, preload, and renderer processes)
- Electron Forge 7.11.1 - Build/package/publish pipeline
  - Config: `forge.config.ts`
  - Plugin: `@electron-forge/plugin-vite` - Vite integration
  - Plugin: `@electron-forge/plugin-fuses` - Electron security fuses
  - Plugin: `@electron-forge/plugin-auto-unpack-natives`
- React Compiler - via `babel-plugin-react-compiler` 1.0.0 + `@rolldown/plugin-babel` 0.2.2
  - Applied in `vite.renderer.config.mts` as a Babel preset

**Linting/Formatting:**
- Biome 2.4.8
  - Config: `biome.json`
  - Formatting: spaces (2), LF line endings, 80 char line width, double quotes
  - Linting: custom rule set (not "recommended" preset), strict TypeScript rules

**Git Hooks:**
- Lefthook 2.1.4
  - Config: `lefthook.yml`
  - Pre-commit: runs `biome check --write` on staged files

## Key Dependencies

**Critical:**
- `effect` 3.21.0 - Core functional programming library; used for service definitions (Context.Tag), error types (Schema.TaggedError), data schemas (Schema.Class), streams, layers, and managed runtimes
- `@effect/platform` 0.96.0 - Cross-platform abstractions (Command, CommandExecutor for spawning CLI processes)
- `@effect/platform-node` 0.106.0 - Node.js implementation of platform services
- `@effect/rpc` 0.75.0 - RPC framework for typed communication between Electron main and renderer processes
- `@effect/language-service` 0.83.1 - TypeScript language service plugin for Effect

**Infrastructure:**
- `electron-squirrel-startup` 1.0.1 - Windows installer integration (Squirrel.Windows)

**Packaging/Distribution:**
- `@electron-forge/maker-squirrel` 7.11.1 - Windows (Squirrel) installer
- `@electron-forge/maker-zip` 7.11.1 - macOS zip archive
- `@electron-forge/maker-rpm` 7.11.1 - Linux RPM package
- `@electron-forge/maker-deb` 7.11.1 - Linux Debian package

## Configuration

**TypeScript:**
- Single `tsconfig.json` at project root (no multi-tsconfig split)
- Target: ESNext, Module: ESNext, moduleResolution: bundler
- Strict mode enabled, noImplicitAny enabled
- Path alias: `@/*` maps to `./src/*`
- Plugins: `@effect/language-service`

**Vite (three configs):**
- `vite.main.config.mts` - Main process (entry: `src/main.ts`), `@/` alias only
- `vite.preload.config.mts` - Preload script (entry: `src/preload.ts`), `@/` alias only
- `vite.renderer.config.mts` - Renderer process, includes TanStack Router plugin, Tailwind plugin, React plugin, Babel/React Compiler preset, `@/` alias

**Electron Forge:**
- `forge.config.ts` - ASAR packaging enabled, Electron Fuses configured for security
- Fuses: RunAsNode disabled, CookieEncryption enabled, NodeOptions disabled, CLI inspect disabled, ASAR integrity enabled, LoadAppFromAsar only

**Biome:**
- `biome.json` - Excludes `src/components/ui` from linting (shadcn generated components)
- JavaScript globals: `MAIN_WINDOW_VITE_DEV_SERVER_URL`, `MAIN_WINDOW_VITE_NAME`

## Scripts

- `npm start` - `electron-forge start` (dev mode)
- `npm run package` - `electron-forge package`
- `npm run make` - `electron-forge make` (create distributable)
- `npm run publish` - `electron-forge publish`
- `npm run lint` / `lint:write` - Biome lint
- `npm run format` / `format:write` - Biome format
- `npm run check` / `check:write` - Biome check (lint + format)
- `npm run typecheck` - `tsc --noEmit`
- `npm test` - `vitest run` (single run)
- `npm run test:watch` - `vitest` (watch mode)

## Platform Requirements

**Development:**
- Node.js 24+ (based on host environment)
- npm 11+
- Claude CLI installed and available on PATH (the app spawns `claude` as a child process)

**Production:**
- Windows (Squirrel installer)
- macOS (ZIP archive)
- Linux (DEB / RPM packages)
- Electron 41 runtime (bundled)

---

*Stack analysis: 2026-03-25*
