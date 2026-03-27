import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { tabStatusAtom } from "@/atoms/chat";
import type { ProjectWithSessions } from "@/atoms/sidebar";
import {
  activeTabIdAtom,
  loadProjectsAtom,
  projectsAtom,
  registerProjectAtom,
  removeProjectAtom,
  setActiveTabAtom,
} from "@/atoms/sidebar";
import { SessionStatusIndicator } from "@/components/session-status-indicator";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Tab } from "@/services/database/tab-store/schemas";
import { CreateSessionDialog } from "./create-session-dialog";
import { ProjectContextMenu } from "./project-context-menu";
import { RemoveProjectDialog } from "./remove-project-dialog";

function SessionEntry({
  isActive,
  session,
}: {
  readonly isActive: boolean;
  readonly session: Tab;
}) {
  // Tab IDs are numbers; chat atoms use string keys
  const tabKey = String(session.id);
  const liveStatus = useAtomValue(tabStatusAtom(tabKey));
  const switchTab = useAtomSet(setActiveTabAtom);

  const label = session.git_branch ?? session.display_label ?? "untitled";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => switchTab(session.id)}
      >
        <span className="truncate">{label}</span>
        <SessionStatusIndicator status={liveStatus} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectGroup({
  activeTabId,
  entry,
  onCreateSession,
  onRemoveProject,
}: {
  readonly activeTabId: number | null;
  readonly entry: ProjectWithSessions;
  readonly onCreateSession: (project: ProjectWithSessions) => void;
  readonly onRemoveProject: (
    project: ProjectWithSessions,
    sessionCount: number,
  ) => void;
}) {
  return (
    <ProjectContextMenu
      onRemove={() => onRemoveProject(entry, entry.sessions.length)}
    >
      <Collapsible
        className="group/collapsible"
        defaultOpen
        key={entry.project.id}
      >
        <SidebarGroup>
          <SidebarGroupLabel
            className="font-normal"
            render={<CollapsibleTrigger />}
          >
            <HugeiconsIcon
              className="transition-transform group-data-[closed]/collapsible:-rotate-90"
              icon={ArrowDown01Icon}
            />
            {entry.project.name}
          </SidebarGroupLabel>
          <SidebarGroupAction
            onClick={(e) => {
              e.stopPropagation(); // Don't toggle collapsible
              onCreateSession(entry);
            }}
            title="New session"
          >
            <HugeiconsIcon icon={Add01Icon} />
          </SidebarGroupAction>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                {entry.sessions.map((session) => (
                  <SessionEntry
                    isActive={session.id === activeTabId}
                    key={session.id}
                    session={session}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </ProjectContextMenu>
  );
}

function EmptyState() {
  const registerProject = useAtomSet(registerProjectAtom);

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-sm font-medium text-sidebar-foreground">
        No projects yet
      </p>
      <p className="text-xs text-muted-foreground">
        Register a project folder to get started.
      </p>
      <Button onClick={() => registerProject()} size="sm" variant="default">
        Register Project
      </Button>
    </div>
  );
}

function AppSidebar() {
  const activeTabId = useAtomValue(activeTabIdAtom);
  const projects = useAtomValue(projectsAtom);
  const loadProjects = useAtomSet(loadProjectsAtom);
  const registerProject = useAtomSet(registerProjectAtom);
  const removeProject = useAtomSet(removeProjectAtom);

  const [createDialogProject, setCreateDialogProject] = useState<{
    id: number;
    name: string;
    cwd: string;
    isGitRepo: boolean;
    worktreeBasePath: string | null;
  } | null>(null);

  const [removeDialogProject, setRemoveDialogProject] = useState<{
    id: number;
    name: string;
    sessionCount: number;
  } | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <Sidebar collapsible="offcanvas" side="left">
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">Mao</span>
          <Button
            onClick={() => registerProject()}
            size="sm"
            title="Register project"
            variant="ghost"
          >
            <HugeiconsIcon icon={Add01Icon} />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          projects.map((entry) => (
            <ProjectGroup
              activeTabId={activeTabId}
              entry={entry}
              key={entry.project.id}
              onCreateSession={(p) =>
                setCreateDialogProject({
                  id: p.project.id,
                  name: p.project.name,
                  cwd: p.project.directory,
                  isGitRepo: p.project.is_git_repo,
                  worktreeBasePath: p.project.worktree_base_path,
                })
              }
              onRemoveProject={(p, sessionCount) =>
                setRemoveDialogProject({
                  id: p.project.id,
                  name: p.project.name,
                  sessionCount,
                })
              }
            />
          ))
        )}
      </SidebarContent>
      {createDialogProject && (
        <CreateSessionDialog
          cwd={createDialogProject.cwd}
          isGitRepo={createDialogProject.isGitRepo}
          onOpenChange={(open) => {
            if (!open) setCreateDialogProject(null);
          }}
          open
          projectId={createDialogProject.id}
          projectName={createDialogProject.name}
          worktreeBasePath={createDialogProject.worktreeBasePath}
        />
      )}
      {removeDialogProject && (
        <RemoveProjectDialog
          onConfirm={() => removeProject(removeDialogProject.id)}
          onOpenChange={(open) => {
            if (!open) setRemoveDialogProject(null);
          }}
          open
          projectName={removeDialogProject.name}
          sessionCount={removeDialogProject.sessionCount}
        />
      )}
    </Sidebar>
  );
}

export { AppSidebar };
