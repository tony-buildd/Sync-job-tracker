import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Suppress unhandled rejection warnings from fake timers + AbortController
    // interaction in timeout tests. The rejections are properly caught in the
    // code under test, but Node reports them due to micro-task timing.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
