---
paths:
  - "src/services/*-rpc/**"
---

# RPC Patterns

- Three files per RPC domain: `group.ts` (RpcGroup), `handlers.ts` (Group.toLayer), `params.ts` (Schema.Class params)
- In `handlers.ts`: yield underlying services, return object mapping RPC names to service calls — see `src/services/persistence-rpc/handlers.ts`
- After creating a new `*RpcGroup`, merge it in **both** `src/services/claude-rpc/client.ts` AND `src/services/claude-rpc/server.ts` — missing either side causes silent failures
- Handler layer must be provided to the server runtime in `src/main.ts` layer composition
- Stream RPCs set `stream: true` in `Rpc.make` config; non-stream RPCs omit it
