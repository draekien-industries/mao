import { Effect } from "effect";
import { ProjectCreate } from "../database/project-store/schemas";
import { ProjectStore } from "../database/project-store/service-definition";
import { SessionReconstructor } from "../database/session-reconstructor/service-definition";
import { TabCreate } from "../database/tab-store/schemas";
import { TabStore } from "../database/tab-store/service-definition";
import { PersistenceRpcGroup } from "./group";

export const PersistenceRpcHandlers = PersistenceRpcGroup.toLayer(
  Effect.gen(function* () {
    const projectStore = yield* ProjectStore;
    const reconstructor = yield* SessionReconstructor;
    const tabStore = yield* TabStore;

    return {
      createProject: (params) =>
        projectStore.create(
          new ProjectCreate({
            directory: params.directory,
            is_git_repo: params.is_git_repo,
            name: params.name,
            worktree_base_path: params.worktree_base_path,
          }),
        ),
      createTab: (params) =>
        tabStore.create(
          new TabCreate({
            cwd: params.cwd,
            display_label: params.display_label,
            git_branch: params.git_branch,
            project_id: params.project_id,
            session_id: params.session_id,
          }),
        ),
      listProjects: () => projectStore.getAll(),
      listTabs: () => tabStore.getAll(),
      reconstructSession: ({ sessionId }) =>
        reconstructor.reconstruct(sessionId),
      removeProject: ({ id }) => projectStore.remove(id),
    };
  }),
);
