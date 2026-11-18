import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/setup/fast-check.ts"],
    // Measured on every `npm test`; scripts/verify/code/coverage.ts holds the ratchet.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["json-summary"],
      reportsDirectory: "dist/coverage",
    },
  },
});
