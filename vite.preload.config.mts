import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      ignored: (filePath: string) => {
        if (!/\./.test(filePath)) return false;
        if (/\.(test|spec)\.(ts|tsx|mts)$/.test(filePath)) return true;
        return !/\.(ts|tsx|mts)$/.test(filePath);
      },
    },
  },
});
