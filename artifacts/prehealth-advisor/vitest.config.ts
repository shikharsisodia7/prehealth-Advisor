import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Stub heavy API client — tests use plain objects matching the type shape
      "@workspace/api-client-react": path.resolve(
        __dirname,
        "src/__stubs__/api-client-react.ts",
      ),
    },
  },
});
