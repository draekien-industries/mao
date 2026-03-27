import { Bug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  createContext as createReactContext,
  useContext,
  useState,
} from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const DebugPanelContext = createReactContext({
  debugOpen: false,
  // biome-ignore lint/suspicious/noEmptyBlockStatements: default noop for context
  setDebugOpen: (_fn: (v: boolean) => boolean) => {},
});

export function useDebugPanel() {
  return useContext(DebugPanelContext);
}

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [debugOpen, setDebugOpen] = useState(false);

  return (
    <DebugPanelContext value={{ debugOpen, setDebugOpen }}>
      <SidebarProvider className="h-screen">
        <AppSidebar />
        <SidebarInset>
          <header className="flex items-center border-b border-border px-2 py-1">
            <SidebarTrigger />
            <div className="ml-auto">
              <Button
                onClick={() => setDebugOpen((v) => !v)}
                size="icon-xs"
                variant={debugOpen ? "secondary" : "ghost"}
              >
                <HugeiconsIcon icon={Bug01Icon} strokeWidth={2} />
              </Button>
            </div>
          </header>
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </SidebarInset>
        {import.meta.env.DEV && (
          <TanStackRouterDevtools position="bottom-right" />
        )}
      </SidebarProvider>
    </DebugPanelContext>
  );
}
