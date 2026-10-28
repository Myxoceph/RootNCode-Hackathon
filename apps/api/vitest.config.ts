import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one PostgreSQL database and some briefly change an
    // asset's status; running files one at a time keeps them from seeing each other's changes.
    fileParallelism: false,
  },
});
