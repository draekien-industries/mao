import { Atom } from "@effect-atom/atom-react";
import { Effect, Stream } from "effect";
import { extractAssistantText } from "@/lib/extract-assistant-text";
import { formatClaudeCliError } from "@/services/claude-cli/errors";
import type { ClaudeEvent } from "@/services/claude-cli/events";
import {
  isAssistantMessage,
  isContentBlockDelta,
  isResult,
  isStreamEvent,
  isSystemInit,
  isTextDelta,
} from "@/services/claude-cli/events";
import { QueryParams, ResumeParams } from "@/services/claude-cli/params";
import { ClaudeCli } from "@/services/claude-cli/service-definition";
import { appRuntime } from "./runtime";

// --- Types ---

export interface ChatMessage {
  readonly content: string;
  readonly role: "user" | "assistant";
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
  Atom.make<ReadonlyArray<ClaudeEvent>>([]).pipe(Atom.keepAlive),
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
  }),
);

// --- Send message action atom ---
// Single global action — not a family — so the fiber is never tied to a
// per-tab atom subscription that gets cleaned up on tab switch.

export const sendMessageAtom = appRuntime.fn(
  (
    params: { readonly tabId: string; readonly prompt: string },
    ctx: Atom.FnContext,
  ) =>
    Effect.gen(function* () {
      const { tabId, prompt } = params;

      // Add user message
      const prevMessages = ctx(messagesAtom(tabId));
      ctx.set(messagesAtom(tabId), [
        ...prevMessages,
        { role: "user" as const, content: prompt },
      ]);
      ctx.set(streamingTextAtom(tabId), "");
      ctx.set(errorAtom(tabId), null);
      ctx.set(isStreamingAtom(tabId), true);

      const cli = yield* ClaudeCli;
      const currentSessionId = ctx(sessionIdAtom(tabId));

      const stream = currentSessionId
        ? cli.resume(
            new ResumeParams({
              prompt,
              session_id: currentSessionId,
            }),
          )
        : cli.query(new QueryParams({ prompt }));

      yield* Stream.runForEach(stream, (event) =>
        Effect.sync(() => {
          const prevEvents = ctx(eventsAtom(tabId));
          ctx.set(eventsAtom(tabId), [...prevEvents, event]);

          if (isSystemInit(event)) {
            ctx.set(sessionIdAtom(tabId), event.session_id);
          } else if (isStreamEvent(event)) {
            if (
              isContentBlockDelta(event.event) &&
              isTextDelta(event.event.delta)
            ) {
              const chunk = event.event.delta.text;
              const prev = ctx(streamingTextAtom(tabId));
              ctx.set(streamingTextAtom(tabId), prev + chunk);
            }
          } else if (isAssistantMessage(event)) {
            const text = extractAssistantText(event);
            const prev = ctx(messagesAtom(tabId));
            ctx.set(messagesAtom(tabId), [
              ...prev,
              { role: "assistant" as const, content: text },
            ]);
            ctx.set(streamingTextAtom(tabId), "");
          } else if (isResult(event)) {
            ctx.set(isStreamingAtom(tabId), false);
          }
        }),
      );
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          ctx.set(errorAtom(params.tabId), formatClaudeCliError(err));
          ctx.set(isStreamingAtom(params.tabId), false);
        }),
      ),
    ),
);
