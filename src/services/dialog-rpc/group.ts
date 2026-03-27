import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { DialogError } from "../dialog/errors";
import { OpenDirectoryParams } from "./params";

export class DialogRpcGroup extends RpcGroup.make(
  Rpc.make("openDirectory", {
    error: DialogError,
    payload: OpenDirectoryParams,
    success: Schema.NullOr(Schema.String),
  }),
) {}
