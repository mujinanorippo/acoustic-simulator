import { defineConfig } from "vite";

// GitHub Pages では リポジトリ名の下に置かれるため、相対パスで出力する
export default defineConfig({
  base: "./",
  // shared/constants などリポジトリ直下の JSON を読み込むため、1つ上の階層の参照を許可する
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist" },
});
