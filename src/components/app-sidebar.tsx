import { useAtomValue } from "@effect-atom/atom-react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { tabStatusAtom } from "@/atoms/chat";
import type { MockSession } from "@/atoms/sidebar";
import { activeTabIdAtom, mockProjects } from "@/atoms/sidebar";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";

function SessionEntry({
  isActive,
  session,
}: {
  readonly isActive: boolean;
  readonly session: MockSession;
}) {
  const liveStatus = useAtomValue(tabStatusAtom(session.id));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive}>
        <span className="truncate">{session.branchLabel}</span>
        <SessionStatusIndicator status={liveStatus} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppSidebar() {
  const activeTabId = useAtomValue(activeTabIdAtom);

  return (
    <Sidebar collapsible="offcanvas" side="left">
      <SidebarHeader className="flex flex-row items-center justify-between">
        <span className="text-base font-semibold">Mao</span>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        {mockProjects.map((project) => (
          <Collapsible
            className="group/collapsible"
            defaultOpen
            key={project.name}
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
                {project.name}
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {project.sessions.map((session) => (
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
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

export { AppSidebar };
