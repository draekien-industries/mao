import { Schema } from "effect"

// Token usage counts (shared by multiple event types)
export class Usage extends Schema.Class<Usage>("Usage")({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
  cache_creation_input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
}) {}

// Content block variants (text or tool use)
export class TextBlock extends Schema.Class<TextBlock>("TextBlock")({
  type: Schema.Literal("text"),
  text: Schema.String,
}) {}

export class ToolUseBlock extends Schema.Class<ToolUseBlock>("ToolUseBlock")({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
}) {}

export const ContentBlock = Schema.Union(TextBlock, ToolUseBlock)
export type ContentBlock = typeof ContentBlock.Type

// Delta variants for streaming content
export class TextDelta extends Schema.Class<TextDelta>("TextDelta")({
  type: Schema.Literal("text_delta"),
  text: Schema.String,
}) {}

export class InputJsonDelta extends Schema.Class<InputJsonDelta>("InputJsonDelta")({
  type: Schema.Literal("input_json_delta"),
  partial_json: Schema.String,
}) {}

export const ContentDelta = Schema.Union(TextDelta, InputJsonDelta)
export type ContentDelta = typeof ContentDelta.Type
