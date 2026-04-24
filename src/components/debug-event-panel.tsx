import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SDKMessage } from "@/services/claude-agent/events";
import {
  isAssistantMessage,
  isContentBlockDelta,
  isPartialAssistantMessage,
  isResultMessage,
  isSystemInitMessage,
  isTextDelta,
} from "@/services/claude-agent/events";

function EventCard({ event }: { event: SDKMessage }) {
  const [expanded, setExpanded] = useState(false);

  const { label, variant, summary } = describeEvent(event);

  return (
    <div className="rounded-lg border border-border bg-card p-2 text-xs">
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium",
            variant === "system" && "bg-blue-500/15 text-blue-600",
            variant === "stream" && "bg-zinc-500/15 text-zinc-500",
            variant === "assistant" && "bg-green-500/15 text-green-600",
            variant === "result" && "bg-amber-500/15 text-amber-600",
            variant === "unknown" && "bg-zinc-500/15 text-zinc-400",
          )}
        >
          {label}
        </span>
        <span className="min-w-0 truncate text-muted-foreground">
          {summary}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {expanded ? "▴" : "▾"}
        </span>
      </button>
      {expanded && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(event, null, 2)}
        </pre>
      )}
    </div>
  );
}

type EventVariant = "system" | "stream" | "assistant" | "result" | "unknown";

function describeEvent(event: SDKMessage): {
  label: string;
  variant: EventVariant;
  summary: string;
} {
  if (isSystemInitMessage(event)) {
    return {
      label: "SystemInit",
      variant: "system",
      summary: `session: ${event.session_id.slice(0, 12)}...`,
    };
  }
  if (isPartialAssistantMessage(event)) {
    if (isContentBlockDelta(event.event) && isTextDelta(event.event.delta)) {
      const preview = event.event.delta.text.slice(0, 40);
      return {
        label: "TextDelta",
        variant: "stream",
        summary: preview || "(empty)",
      };
    }
    return { label: event.event.type, variant: "stream", summary: "" };
  }
  if (isAssistantMessage(event)) {
    const blockCount = event.message.content.length;
    return {
      label: "Assistant",
      variant: "assistant",
      summary: `${blockCount} block${blockCount !== 1 ? "s" : ""} · ${event.message.model}`,
    };
  }
  if (isResultMessage(event)) {
    const cost = event.total_cost_usd
      ? ` · $${event.total_cost_usd.toFixed(4)}`
      : "";
    return {
      label: event.is_error ? "Error" : "Result",
      variant: "result",
      summary: `${event.subtype}${cost}`,
    };
  }
  return { label: event.type, variant: "unknown", summary: "" };
}

export function DebugEventPanel({
  events,
  eventCount,
  isOpen,
}: {
  events: SDKMessage[];
  eventCount: number;
  isOpen: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [eventCount, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-[350px] shrink-0 flex-col border-l border-border">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        Events ({eventCount})
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {eventCount === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No events yet. Send a message to start.
          </p>
        )}
        {events.map((event, i) => (
          <EventCard event={event} key={i} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
