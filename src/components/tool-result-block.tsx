import { cn } from "@/lib/utils";

interface ToolResultBlockProps {
  readonly content: string;
  readonly isError: boolean;
}

export function ToolResultBlock({ content, isError }: ToolResultBlockProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-border bg-muted/50 px-3 py-2">
        <span
          className={cn(
            "text-xs font-semibold",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isError ? "Tool Error" : "Tool Result"}
        </span>
        <div className="mt-1 whitespace-pre-wrap text-sm">{content}</div>
      </div>
    </div>
  );
}
