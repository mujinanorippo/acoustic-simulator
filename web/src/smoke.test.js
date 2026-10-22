// フェーズ0：テストの仕組みそのものが動くことだけを確認する
import { describe, expect, it } from "vitest";
import fc from "fast-check";

describe("テスト基盤", () => {
  it("通常のテストが実行できる", () => {
    expect(1 + 1).toBe(2);
  });

  it("ランダム入力のテスト（プロパティベーステスト）が実行できる", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (left, right) => left + right === right + left),
    );
  });
});
