import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } }, // Next.js "@/..." imports
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      all: true,
      include: ["lib/**/*.ts", "app/**/route.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      // Ratchet: a little below what is achieved today, so any drop fails the run. Raise when coverage rises.
      thresholds: {
        "lib/**": { statements: 99, lines: 99, functions: 100, branches: 98 },
        "app/**": { statements: 50, lines: 50, functions: 70, branches: 68 }, // route handlers only; auth/callback and auth/dev still have no unit test
      },
    },
  },
});
