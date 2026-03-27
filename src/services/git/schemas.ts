import { Schema } from "effect";

export class Worktree extends Schema.Class<Worktree>("Worktree")({
  branch: Schema.NullOr(Schema.String),
  head: Schema.String,
  path: Schema.String,
}) {}
