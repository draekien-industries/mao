import { Atom } from "@effect-atom/atom-react";
import { Effect, Stream } from "effect";
import { activeTabIdAtom } from "@/atoms/sidebar";
import { extractAssistantText } from "@/lib/extract-assistant-text";
import { formatClaudeAgentError } from "@/services/claude-agent/errors";
import type { SDKMessage } from "@/services/claude-agent/events";
import {
  isAssistantMessage,
  isContentBlockDelta,
  isPartialAssistantMessage,
  isResultMessage,
  isSystemInitMessage,
  isTextDelta,
} from "@/services/claude-agent/events";
import { QueryParams, ResumeParams } from "@/services/claude-agent/params";
import { ClaudeAgent } from "@/services/claude-agent/service-definition";
import { RendererRpcClient } from "@/services/claude-rpc/client";
import { annotations } from "@/services/diagnostics";
import { appRuntime } from "./runtime";

// --- Types ---

export interface ChatMessage {
  readonly content: string;
  readonly isError?: boolean;
  readonly role: "user" | "assistant" | "tool_result";
  readonly toolUseId?: string;
}

// --- Writable state atoms per tab (D-03: Atom.family keyed by tab ID) ---

export const messagesAtom = Atom.family((_tabId: string) =>
  Atom.make<ReadonlyArray<ChatMessage>>([]).pipe(Atom.keepAlive),
);

export const streamingTextAtom = Atom.family((_tabId: string) =>
  Atom.make("").pipe(Atom.keepAlive),
);

export const sessionIdAtom = Atom.family((_tabId: string) =>
  Atom.make<string | null>(null).pipe(Atom.keepAlive),
);

export const isStreamingAtom = Atom.family((_tabId: string) =>
  Atom.make(false).pipe(Atom.keepAlive),
);

export const errorAtom = Atom.family((_tabId: string) =>
  Atom.make<string | null>(null).pipe(Atom.keepAlive),
);

export const eventsAtom = Atom.family((_tabId: string) =>
  Atom.make<ReadonlyArray<SDKMessage>>([]).pipe(Atom.keepAlive),
);

// --- New per-tab state atoms for multi-tab orchestration ---

export const unreadAtom = Atom.family((_tabId: string) =>
  Atom.make(false).pipe(Atom.keepAlive),
);

export const toolInputAtom = Atom.family((_tabId: string) =>
  Atom.make(false).pipe(Atom.keepAlive),
);

export const draftInputAtom = Atom.family((_tabId: string) =>
  Atom.make("").pipe(Atom.keepAlive),
);

// Per-tab working directory, populated by sidebar on tab activation
export const cwdAtom = Atom.family((_tabId: string) =>
  Atom.make("").pipe(Atom.keepAlive),
);

// Global concurrency counter — how many tabs are actively streaming
export const activeStreamCountAtom = Atom.make(0).pipe(Atom.keepAlive);

// --- Derived status atom for sidebar indicators ---
// D-05: Priority order error > tool-input > unread > streaming > idle

export type TabStatus =
  | "streaming"
  | "unread"
  | "error"
  | "tool-input"
  | "idle";

export const tabStatusAtom = Atom.family((tabId: string) =>
  Atom.make((get) => {
    const err = get(errorAtom(tabId));
    const toolInput = get(toolInputAtom(tabId));
    const unread = get(unreadAtom(tabId));
    const streaming = get(isStreamingAtom(tabId));
    if (err !== null) return "error" as const;
    if (toolInput) return "tool-input" as const;
    if (unread) return "unread" as const;
    if (streaming) return "streaming" as const;
    return "idle" as const;
  }).pipe(Atom.keepAlive),
);

// --- Send message action atom ---
// Family keyed by tabId so each tab gets its own fiber — concurrent
// streaming in Tab A won't be interrupted when Tab B starts a new message.
// Atom.keepAlive prevents the atom (and its fiber) from being cleaned up
// when the ChatPanel unmounts on tab switch.

export const sendMessageAtom = Atom.family((tabId: string) =>
  appRuntime
    .fn((prompt: string, ctx: Atom.FnContext) =>
      Effect.gen(function* () {
        yield* Effect.logDebug("Sending message").pipe(
          Effect.annotateLogs(annotations.tabId, tabId),
        );

        // Add user message and clear previous state (D-09: error cleared on new send)
        const prevMessages = ctx(messagesAtom(tabId));
        ctx.set(messagesAtom(tabId), [
          ...prevMessages,
          { role: "user" as const, content: prompt },
        ]);
        ctx.set(streamingTextAtom(tabId), "");
        ctx.set(errorAtom(tabId), null);
        ctx.set(toolInputAtom(tabId), false);
        ctx.set(isStreamingAtom(tabId), true);

        // D-10, D-12: Track concurrent stream count
        ctx.set(activeStreamCountAtom, ctx(activeStreamCountAtom) + 1);

        const agent = yield* ClaudeAgent;
        const rpcClient = yield* RendererRpcClient;
        const currentSessionId = ctx(sessionIdAtom(tabId));
        const cwd = ctx(cwdAtom(tabId));

        const stream = currentSessionId
          ? agent.resume(
              new ResumeParams({
                prompt,
                session_id: currentSessionId,
                cwd: cwd || undefined,
              }),
            )
          : agent.query(new QueryParams({ prompt, cwd: cwd || undefined }));

        yield* Stream.runForEach(stream, (event) =>
          Effect.gen(function* () {
            const prevEvents = ctx(eventsAtom(tabId));
            ctx.set(eventsAtom(tabId), [...prevEvents, event]);

            if (isSystemInitMessage(event)) {
              ctx.set(sessionIdAtom(tabId), event.session_id);
              // Persist session_id to Tab DB record on first message
              if (currentSessionId === null) {
                yield* rpcClient
                  .updateTab({
                    id: Number(tabId),
                    session_id: event.session_id,
                  })
                  .pipe(
                    Effect.tapError((err) =>
                      Effect.logError(
                        "Failed to persist session_id to tab",
                      ).pipe(
                        Effect.annotateLogs("error", String(err)),
                        Effect.annotateLogs(annotations.tabId, tabId),
                      ),
                    ),
                    Effect.catchAll(() => Effect.void),
                  );
              }
              // Clear tool-input when new stream starts after tool approval
              ctx.set(toolInputAtom(tabId), false);
            } else if (isPartialAssistantMessage(event)) {
              if (
                isContentBlockDelta(event.event) &&
                isTextDelta(event.event.delta)
              ) {
                const chunk = event.event.delta.text;
                const prev = ctx(streamingTextAtom(tabId));
                ctx.set(streamingTextAtom(tabId), prev + chunk);
              }
            } else if (isAssistantMessage(event)) {
              // D-03: Tool-input detection
              const hasToolUse = event.message.content.some(
                (block) => block.type === "tool_use",
              );
              if (hasToolUse) {
                ctx.set(toolInputAtom(tabId), true);
              }

              // Existing: extract text, update messages, clear streaming text
              const text = extractAssistantText(event);
              const prev = ctx(messagesAtom(tabId));
              ctx.set(messagesAtom(tabId), [
                ...prev,
                { role: "assistant" as const, content: text },
              ]);
              ctx.set(streamingTextAtom(tabId), "");

              // D-07: Mark tab unread when message arrives on non-active tab
              const activeTab = ctx(activeTabIdAtom);
              if (String(activeTab) !== tabId) {
                ctx.set(unreadAtom(tabId), true);
              }
            } else if (isResultMessage(event)) {
              ctx.set(isStreamingAtom(tabId), false);
              ctx.set(toolInputAtom(tabId), false);
            }
          }),
        ).pipe(
          // D-10: Guarantee stream count decrement on completion or error
          Effect.ensuring(
            Effect.sync(() => {
              ctx.set(
                activeStreamCountAtom,
                Math.max(0, ctx(activeStreamCountAtom) - 1),
              );
            }),
          ),
        );
      }).pipe(
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            yield* Effect.logError("Send message failed").pipe(
              Effect.annotateLogs("error", formatClaudeAgentError(err)),
              Effect.annotateLogs(annotations.tabId, tabId),
            );
            ctx.set(errorAtom(tabId), formatClaudeAgentError(err));
            ctx.set(isStreamingAtom(tabId), false);
          }),
        ),
        Effect.annotateLogs(annotations.service, "chat"),
      ),
    )
    .pipe(Atom.keepAlive),
);
