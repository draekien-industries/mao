import { Schema } from "effect";

export class Usage extends Schema.Class<Usage>("Usage")({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
  cache_creation_input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
}) {}

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

export class ThinkingBlock extends Schema.Class<ThinkingBlock>("ThinkingBlock")(
  {
    type: Schema.Literal("thinking"),
    thinking: Schema.String,
  },
) {}

export const ContentBlock = Schema.Union(
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
);
export type ContentBlock = typeof ContentBlock.Type;

export class ToolResultBlock extends Schema.Class<ToolResultBlock>(
  "ToolResultBlock",
)({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  content: Schema.Union(
    Schema.String,
    Schema.Array(
      Schema.Struct({
        type: Schema.String,
        text: Schema.optional(Schema.String),
      }),
    ),
  ),
  is_error: Schema.optional(Schema.Boolean),
}) {}

export class TextDelta extends Schema.Class<TextDelta>("TextDelta")({
  type: Schema.Literal("text_delta"),
  text: Schema.String,
}) {}

export class InputJsonDelta extends Schema.Class<InputJsonDelta>(
  "InputJsonDelta",
)({
  type: Schema.Literal("input_json_delta"),
  partial_json: Schema.String,
}) {}

export class ThinkingDelta extends Schema.Class<ThinkingDelta>("ThinkingDelta")(
  {
    type: Schema.Literal("thinking_delta"),
    thinking: Schema.String,
  },
) {}

export const ContentDelta = Schema.Union(
  TextDelta,
  InputJsonDelta,
  ThinkingDelta,
);
export type ContentDelta = typeof ContentDelta.Type;

export class ContentBlockDeltaApiEvent extends Schema.Class<ContentBlockDeltaApiEvent>(
  "ContentBlockDeltaApiEvent",
)({
  type: Schema.Literal("content_block_delta"),
  index: Schema.Number,
  delta: ContentDelta,
}) {}

export class ContentBlockStartApiEvent extends Schema.Class<ContentBlockStartApiEvent>(
  "ContentBlockStartApiEvent",
)({
  type: Schema.Literal("content_block_start"),
  index: Schema.Number,
  content_block: ContentBlock,
}) {}

export class ContentBlockStopApiEvent extends Schema.Class<ContentBlockStopApiEvent>(
  "ContentBlockStopApiEvent",
)({
  type: Schema.Literal("content_block_stop"),
  index: Schema.Number,
}) {}

// Catchall for BetaRawMessageStreamEvent variants we don't inspect
// (message_start, message_delta, message_stop) — must be last in the union.
export class ApiStreamEventUnknown extends Schema.Class<ApiStreamEventUnknown>(
  "ApiStreamEventUnknown",
)({
  type: Schema.String,
}) {}

export const ApiStreamEvent = Schema.Union(
  ContentBlockStartApiEvent,
  ContentBlockDeltaApiEvent,
  ContentBlockStopApiEvent,
  ApiStreamEventUnknown,
);
export type ApiStreamEvent = typeof ApiStreamEvent.Type;

// SDK: SDKSystemMessage — cwd and apiKeySource are required fields.
export class SDKSystemInitMessage extends Schema.Class<SDKSystemInitMessage>(
  "SDKSystemInitMessage",
)({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  uuid: Schema.String,
  session_id: Schema.String,
  tools: Schema.Array(Schema.String),
  model: Schema.String,
  permissionMode: Schema.String,
  cwd: Schema.String,
  apiKeySource: Schema.String,
}) {}

// SDK: SDKAssistantMessageError is a string literal union — we decode as
// optional string to avoid hardcoding the union and breaking on new values.
export class SDKAssistantMessage extends Schema.Class<SDKAssistantMessage>(
  "SDKAssistantMessage",
)({
  type: Schema.Literal("assistant"),
  uuid: Schema.String,
  session_id: Schema.String,
  parent_tool_use_id: Schema.NullOr(Schema.String),
  error: Schema.optional(Schema.String),
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("assistant"),
    content: Schema.Array(ContentBlock),
    model: Schema.String,
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
    usage: Usage,
  }),
}) {}

// SDK: SDKPartialAssistantMessage has optional ttft_ms field.
export class SDKPartialAssistantMessage extends Schema.Class<SDKPartialAssistantMessage>(
  "SDKPartialAssistantMessage",
)({
  type: Schema.Literal("stream_event"),
  uuid: Schema.String,
  session_id: Schema.String,
  parent_tool_use_id: Schema.NullOr(Schema.String),
  event: ApiStreamEvent,
  ttft_ms: Schema.optional(Schema.Number),
}) {}

// SDK: SDKUserMessage has uuid? and session_id? as optional fields.
export class SDKUserMessage extends Schema.Class<SDKUserMessage>(
  "SDKUserMessage",
)({
  type: Schema.Literal("user"),
  uuid: Schema.optional(Schema.String),
  session_id: Schema.optional(Schema.String),
  parent_tool_use_id: Schema.NullOr(Schema.String),
  message: Schema.Struct({
    role: Schema.Literal("user"),
    content: Schema.Array(ToolResultBlock),
  }),
}) {}

// SDK: SDKResultSuccess and SDKResultError both have duration_ms,
// duration_api_ms, num_turns, total_cost_usd, usage as required fields.
// We use a single class covering both subtypes; result is only present
// on success so we keep it optional.
export class SDKResultMessage extends Schema.Class<SDKResultMessage>(
  "SDKResultMessage",
)({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  uuid: Schema.String,
  session_id: Schema.String,
  is_error: Schema.Boolean,
  result: Schema.optional(Schema.String),
  duration_ms: Schema.Number,
  duration_api_ms: Schema.Number,
  num_turns: Schema.Number,
  total_cost_usd: Schema.Number,
  usage: Usage,
}) {}

// Catchall — must be last; matches anything with a `type` field
export class SDKUnknownMessage extends Schema.Class<SDKUnknownMessage>(
  "SDKUnknownMessage",
)({
  type: Schema.String,
  session_id: Schema.optional(Schema.String),
  uuid: Schema.optional(Schema.String),
}) {}

export const SDKMessage = Schema.Union(
  SDKSystemInitMessage,
  SDKPartialAssistantMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKUnknownMessage,
);
export type SDKMessage = typeof SDKMessage.Type;

export const isSystemInitMessage = Schema.is(SDKSystemInitMessage);
export const isAssistantMessage = Schema.is(SDKAssistantMessage);
export const isPartialAssistantMessage = Schema.is(SDKPartialAssistantMessage);
export const isUserMessage = Schema.is(SDKUserMessage);
export const isResultMessage = Schema.is(SDKResultMessage);

export const isContentBlockDelta = Schema.is(ContentBlockDeltaApiEvent);
export const isTextDelta = Schema.is(TextDelta);
