import { Schema } from "effect";

export class DialogError extends Schema.TaggedError<DialogError>()(
  "DialogError",
  { message: Schema.String, operation: Schema.String },
) {}
