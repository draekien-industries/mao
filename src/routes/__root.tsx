import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <SidebarProvider className="h-screen">
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center border-b border-border px-2 py-1">
          <SidebarTrigger />
        </header>
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
      {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </SidebarProvider>
  );
}
