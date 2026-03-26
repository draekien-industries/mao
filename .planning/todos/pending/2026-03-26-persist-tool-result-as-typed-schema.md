---
created: 2026-03-26T10:01:53.891Z
title: Persist tool_result as typed schema
area: api
files:
  - src/services/claude-cli/events.ts:173-187
  - src/services/database/event-store/schemas.ts:17-29
---

## Problem

`tool_result` events from Claude CLI are currently caught by the `UnknownEvent` catchall schema (the last member of the `ClaudeEvent` union in `events.ts:174`). This means tool results lose their typed structure when persisted — they're stored as generic unknown events with only `type` and optional `session_id`/`uuid` fields, discarding the actual tool result payload (tool name, output content, error status, etc.).

The same issue propagates to `StoredEvent` in `event-store/schemas.ts:27` where `UnknownEvent` is the catchall for the persistence layer.

## Solution

Create a dedicated `ToolResultEvent` Effect Schema class that models the `tool_result` event structure from Claude CLI (tool name, content blocks, is_error flag, etc.). Insert it into both the `ClaudeEvent` and `StoredEvent` unions **before** `UnknownEvent` so it gets matched by the decoder. This preserves the typed payload through persistence and allows future features (e.g., displaying tool outputs in the UI) to work with structured data.
