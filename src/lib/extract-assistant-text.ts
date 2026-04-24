import type { SDKAssistantMessage } from "@/services/claude-agent/events";

type AssistantMessageLike = Pick<SDKAssistantMessage, "message">;

export const extractAssistantText = (event: AssistantMessageLike): string =>
  event.message.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && "text" in block,
    )
    .map((block) => block.text)
    .join("");
