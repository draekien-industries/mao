import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect } from "react";
import { tabStatusAtom } from "@/atoms/chat";
import type { ProjectWithSessions } from "@/atoms/sidebar";
import {
  activeTabIdAtom,
  loadProjectsAtom,
  projectsAtom,
  setActiveTabAtom,
} from "@/atoms/sidebar";
import { SessionStatusIndicator } from "@/components/session-status-indicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Tab } from "@/services/database/tab-store/schemas";

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
}: {
  readonly activeTabId: number | null;
  readonly entry: ProjectWithSessions;
}) {
  return (
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
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-sm font-medium text-sidebar-foreground">
        No projects yet
      </p>
      <p className="text-xs text-muted-foreground">
        Register a project folder to get started.
      </p>
    </div>
  );
}

function AppSidebar() {
  const activeTabId = useAtomValue(activeTabIdAtom);
  const projects = useAtomValue(projectsAtom);
  const loadProjects = useAtomSet(loadProjectsAtom);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <Sidebar collapsible="offcanvas" side="left">
      <SidebarHeader>
        <span className="text-base font-semibold">Mao</span>
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
            />
          ))
        )}
      </SidebarContent>
    </Sidebar>
  );
}

export { AppSidebar };
