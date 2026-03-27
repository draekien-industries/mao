import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mockProjects } from "@/atoms/sidebar";
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

const ACTIVE_TAB_ID = "tab-1";

function AppSidebar() {
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
                      <SidebarMenuItem key={session.id}>
                        <SidebarMenuButton
                          isActive={session.id === ACTIVE_TAB_ID}
                        >
                          <span className="truncate">
                            {session.branchLabel}
                          </span>
                          <SessionStatusIndicator status={session.status} />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
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
