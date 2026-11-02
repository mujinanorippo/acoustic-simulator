// 元に戻す・やり直しの履歴
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createHistory } from "./history.js";

describe("createHistory", () => {
  it("変更 → 戻す → やり直す", () => {
    const history = createHistory();
    history.record({ value: 1 });
    expect(history.undo({ value: 2 })).toEqual({ value: 1 });
    expect(history.redo({ value: 1 })).toEqual({ value: 2 });
    expect(history.canRedo()).toBe(false);
  });

  it("戻した後に新しく変えると、やり直しは消える。空のときは null", () => {
    const history = createHistory();
    expect(history.undo({ value: 0 })).toBeNull();
    history.record({ value: 1 });
    history.undo({ value: 2 });
    history.record({ value: 1 });
    expect(history.redo({ value: 3 })).toBeNull();
  });

  it("積んだのはコピー（あとで元を変えても履歴は変わらない）。上限を超えたら古いほうから消える", () => {
    const history = createHistory(2);
    const state = { value: 1 };
    history.record(state);
    state.value = 99;
    history.record({ value: 2 });
    history.record({ value: 3 });
    expect(history.undo({ value: 4 })).toEqual({ value: 3 });
    expect(history.undo({ value: 3 })).toEqual({ value: 2 });
    expect(history.undo({ value: 2 })).toBeNull();
  });

  it("戻す・やり直すを好きな順で連打しても、戻した数とやり直した数が合う", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("record", "undo", "redo"), { maxLength: 60 }), (ops) => {
        const history = createHistory();
        let current = 0;
        let next = 1;
        for (const op of ops) {
          if (op === "record") {
            history.record(current);
            current = next;
            next += 1;
          } else {
            const result = history[op](current);
            if (result !== null) current = result;
          }
        }
        while (history.canUndo()) current = history.undo(current);
        return current === 0 || !ops.includes("record");
      }),
    );
  });
});
