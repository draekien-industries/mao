import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { DatabaseQueryError } from "../database/errors";
import { Project } from "../database/project-store/schemas";
import { ReconstructedSession } from "../database/session-reconstructor/schemas";
import { Tab } from "../database/tab-store/schemas";
import {
  CreateProjectParams,
  CreateTabParams,
  ListProjectsParams,
  ListTabsParams,
  ReconstructSessionParams,
  RemoveProjectParams,
  UpdateTabParams,
} from "./params";

export class PersistenceRpcGroup extends RpcGroup.make(
  Rpc.make("createProject", {
    error: DatabaseQueryError,
    payload: CreateProjectParams,
    success: Project,
  }),
  Rpc.make("createTab", {
    error: DatabaseQueryError,
    payload: CreateTabParams,
    success: Tab,
  }),
  Rpc.make("listProjects", {
    error: DatabaseQueryError,
    payload: ListProjectsParams,
    success: Schema.Array(Project),
  }),
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
  Rpc.make("removeProject", {
    error: DatabaseQueryError,
    payload: RemoveProjectParams,
    success: Schema.Void,
  }),
  Rpc.make("updateTab", {
    error: DatabaseQueryError,
    payload: UpdateTabParams,
    success: Schema.Void,
  }),
) {}
