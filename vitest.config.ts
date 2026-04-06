import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude extension/ tests — they have their own vitest config
    exclude: ["node_modules/**", "extension/**", "dist/**", ".next/**"],
  },
});
