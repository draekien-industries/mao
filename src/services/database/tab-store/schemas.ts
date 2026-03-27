import { Schema } from "effect";

export class Tab extends Schema.Class<Tab>("Tab")({
  created_at: Schema.String,
  cwd: Schema.String,
  display_label: Schema.NullOr(Schema.String),
  git_branch: Schema.NullOr(Schema.String),
  id: Schema.Number,
  project_id: Schema.NullOr(Schema.Number),
  session_id: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
}) {}

export class TabCreate extends Schema.Class<TabCreate>("TabCreate")({
  cwd: Schema.String,
  display_label: Schema.optional(Schema.String),
  git_branch: Schema.optional(Schema.String),
  project_id: Schema.optional(Schema.Number),
  session_id: Schema.optional(Schema.String),
}) {}

export class TabUpdate extends Schema.Class<TabUpdate>("TabUpdate")({
  cwd: Schema.optional(Schema.String),
  display_label: Schema.optional(Schema.String),
  git_branch: Schema.optional(Schema.String),
  project_id: Schema.optional(Schema.Number),
  session_id: Schema.optional(Schema.String),
}) {}
