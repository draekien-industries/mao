import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  draftInputAtom,
  errorAtom,
  eventsAtom,
  isStreamingAtom,
  messagesAtom,
  sendMessageAtom,
  streamingTextAtom,
  unreadAtom,
} from "@/atoms/chat";
import { autoScrollAtom, scrollPositionAtom } from "@/atoms/scroll";
import { activeTabIdAtom, sessionLoadingAtom } from "@/atoms/sidebar";
import { DebugEventPanel } from "@/components/debug-event-panel";
import { MessageSkeleton } from "@/components/message-skeleton";
import { ToolResultBlock } from "@/components/tool-result-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebugPanel } from "./__root";

const AT_BOTTOM_THRESHOLD = 32;

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

// Outer component: guards against null activeTabId so atom family hooks
// are never called with a "none" key. This ensures unreadAtom, messagesAtom,
// etc. are always keyed to a real numeric tab ID matching the sidebar atoms.
function IndexComponent() {
  const activeTabId = useAtomValue(activeTabIdAtom);

  if (activeTabId === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select a session to start chatting.
        </p>
      </div>
    );
  }

  return <ChatPanel tabKey={String(activeTabId)} />;
}

// Inner component: receives a guaranteed-valid tabKey prop.
// Only mounts when activeTabId is a real number, so all atom family
// subscriptions use the actual tab ID (e.g. "42"), never "none".
function ChatPanel({ tabKey }: { readonly tabKey: string }) {
  const messages = useAtomValue(messagesAtom(tabKey));
  const streamingText = useAtomValue(streamingTextAtom(tabKey));
  const isStreaming = useAtomValue(isStreamingAtom(tabKey));
  const error = useAtomValue(errorAtom(tabKey));
  const events = useAtomValue(eventsAtom(tabKey));
  const sessionLoading = useAtomValue(sessionLoadingAtom);
  const sendMessage = useAtomSet(sendMessageAtom);
  const { debugOpen } = useDebugPanel();

  // Per-tab draft input via atom (D-16)
  const draft = useAtomValue(draftInputAtom(tabKey));
  const setDraft = useAtomSet(draftInputAtom(tabKey));

  // Per-tab scroll state atoms
  const autoScroll = useAtomValue(autoScrollAtom(tabKey));
  const setAutoScroll = useAtomSet(autoScrollAtom(tabKey));
  const savedScrollPos = useAtomValue(scrollPositionAtom(tabKey));
  const setScrollPosition = useAtomSet(scrollPositionAtom(tabKey));
  const setUnread = useAtomSet(unreadAtom(tabKey));

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Smart scroll event handler: track position, toggle auto-scroll, clear unread (D-08)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const atBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight <
          AT_BOTTOM_THRESHOLD;
        setAutoScroll(atBottom);
        setScrollPosition(el.scrollTop);
        if (atBottom) {
          setUnread(false);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", onScroll);
    };
  }, [tabKey, setAutoScroll, setScrollPosition, setUnread]);

  // Restore scroll position on tab switch (D-13, D-15 instant)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = savedScrollPos;
  }, [tabKey, savedScrollPos]);

  // Auto-scroll on new content when enabled (D-14)
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, autoScroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    sendMessage({ tabId: tabKey, prompt: trimmed });
    setDraft("");
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex-1 space-y-3 overflow-y-auto p-4"
          ref={scrollContainerRef}
        >
          {sessionLoading ? (
            <MessageSkeleton />
          ) : (
            <>
              {messages.length === 0 && !streamingText && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Send a message to start chatting.
                </p>
              )}

              {messages.map((msg, i) =>
                msg.role === "tool_result" ? (
                  <ToolResultBlock
                    content={msg.content}
                    isError={msg.isError === true}
                    key={i}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}
                    key={i}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ),
              )}

              {streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2 text-sm">
                    {streamingText}
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <form
          className="flex gap-2 border-t border-border p-4"
          onSubmit={handleSubmit}
        >
          <Input
            autoFocus
            disabled={isStreaming}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={isStreaming ? "Waiting for response..." : "Message..."}
            value={draft}
          />
          <Button disabled={isStreaming} size="icon" type="submit">
            <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
          </Button>
        </form>
      </div>

      <DebugEventPanel
        eventCount={events.length}
        events={[...events]}
        isOpen={debugOpen}
      />
    </div>
  );
}
