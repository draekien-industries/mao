import { RegistryProvider } from "@effect-atom/atom-react";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/lib/router";

function App() {
  return (
    <RegistryProvider>
      <RouterProvider router={router} />
    </RegistryProvider>
  );
}

export default App;
