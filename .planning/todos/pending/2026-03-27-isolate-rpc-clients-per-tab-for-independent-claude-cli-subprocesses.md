---
created: 2026-03-27T15:13:59.835Z
title: Isolate RPC clients per tab for independent claude-cli subprocesses
area: api
files:
  - src/services/claude-rpc/client.ts
  - src/services/claude-rpc/runtime.ts
  - src/services/claude-rpc/server.ts
  - src/services/claude-rpc/group.ts
  - src/atoms/runtime.ts
---

## Problem

Currently all tabs share a single RPC connection to the backend. When the user switches tabs, the first tab's in-flight request is discarded because the shared client gets reassigned. Each tab needs its own isolated RPC client that spawns and owns its own claude-cli subprocess so that switching tabs does not interrupt ongoing conversations.

## Solution

Each tab should instantiate its own RPC client backed by a dedicated claude-cli subprocess. The lifecycle of the subprocess should be tied to the tab — when a tab is created a new subprocess is spawned, and when a tab is closed the subprocess is terminated. This likely involves moving from a singleton RPC client to a per-tab client map keyed by tab ID, and updating the runtime/atoms layer to resolve the correct client for the active tab.
