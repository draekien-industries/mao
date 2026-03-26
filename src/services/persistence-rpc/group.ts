import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { DatabaseQueryError } from "../database/errors";
import { ReconstructedSession } from "../database/session-reconstructor/schemas";
import { Tab } from "../database/tab-store/schemas";
import { ListTabsParams, ReconstructSessionParams } from "./params";

export class PersistenceRpcGroup extends RpcGroup.make(
  Rpc.make("listTabs", {
    error: DatabaseQueryError,
    payload: ListTabsParams,
    success: Schema.Array(Tab),
  }),
  Rpc.make("reconstructSession", {
    error: DatabaseQueryError,
    payload: ReconstructSessionParams,
    success: ReconstructedSession,
  }),
) {}
