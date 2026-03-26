import type { AssistantMessageEvent } from "@/services/claude-cli/events";

export const extractAssistantText = (event: AssistantMessageEvent): string =>
  event.message.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && "text" in block,
    )
    .map((block) => block.text)
    .join("");
