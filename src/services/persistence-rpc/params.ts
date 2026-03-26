import { Schema } from "effect";

export class ListTabsParams extends Schema.Class<ListTabsParams>(
  "ListTabsParams",
)({}) {}

export class ReconstructSessionParams extends Schema.Class<ReconstructSessionParams>(
  "ReconstructSessionParams",
)({
  sessionId: Schema.String,
}) {}
