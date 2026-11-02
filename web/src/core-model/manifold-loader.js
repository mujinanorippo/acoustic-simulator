// manifold-3d（ブール演算の WebAssembly）を読み込む。読み込みは画面の起動時に1回だけ行い、
// できたライブラリを geometry.js の関数に引数で渡す（計算の関数は純粋に保つ）。
// wasm ファイルの場所はビルドツール（Vite）に URL として渡してもらう。
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";

let loading = null;

export function loadManifold() {
  loading ??= Module({ locateFile: () => wasmUrl }).then((wasm) => {
    wasm.setup();
    return wasm;
  });
  return loading;
}
