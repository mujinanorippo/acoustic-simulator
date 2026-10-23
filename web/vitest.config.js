import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.js", "test/**/*.test.js"],
    // 数値計算のテストは、カバー率測定（計測のぶん遅くなる）や並行実行で数秒かかるため長めにする
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/**/*.test.js"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
