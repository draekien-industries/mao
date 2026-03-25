import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/lib/router";
import { AppRuntime, RuntimeProvider } from "@/services/claude-rpc/runtime";

function App() {
  return (
    <RuntimeProvider value={AppRuntime}>
      <RouterProvider router={router} />
    </RuntimeProvider>
  );
}

export default App;
