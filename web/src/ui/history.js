// 元に戻す・やり直し（Ctrl+Z・Ctrl+Y）の履歴。部屋の形を変えるたびに、変える前の形を積んでおく。
// 画面に触れない純粋なデータ構造。積むのはコピーなので、あとで元の形を書き換えても履歴は変わらない。

export const HISTORY_LIMIT = 200;

export function createHistory(limit = HISTORY_LIMIT) {
  const undoStack = [];
  const redoStack = [];
  return {
    /** 変える前の状態を積む（新しく変えたので、やり直しの履歴は消える） */
    record(previous) {
      undoStack.push(structuredClone(previous));
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    },
    /** 1つ前に戻す。current は今の状態（やり直し用に積む）。戻せないときは null */
    undo(current) {
      if (undoStack.length === 0) return null;
      redoStack.push(structuredClone(current));
      return undoStack.pop();
    },
    /** 戻したのをやり直す。できないときは null */
    redo(current) {
      if (redoStack.length === 0) return null;
      undoStack.push(structuredClone(current));
      return redoStack.pop();
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
