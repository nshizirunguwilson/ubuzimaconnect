import { defineConfig } from "vitest/config";

// Black-box tests: the built API and mock NIDA run as real processes against the test database.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
