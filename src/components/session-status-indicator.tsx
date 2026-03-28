import { cn } from "@/lib/utils";

type SessionStatus = "streaming" | "unread" | "error" | "tool-input" | "idle";

function SessionStatusIndicator({
  status,
}: {
  readonly status: SessionStatus;
}) {
  if (status === "idle") return null;

  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "streaming" && "animate-pulse bg-sidebar-primary",
        status === "unread" && "bg-sidebar-primary",
        status === "error" && "bg-destructive",
        status === "tool-input" && "bg-status-tool-input",
      )}
    />
  );
}

export type { SessionStatus };
export { SessionStatusIndicator };
