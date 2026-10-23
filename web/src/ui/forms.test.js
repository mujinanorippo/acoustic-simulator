// 入力欄の読み取り（意図的エラー：0、負、極端、文字列、空欄、全角数字）
import { describe, expect, it } from "vitest";
import { mmToM, parseNumberField, percentToRatio } from "./forms.js";
import { toCoreLayer } from "./layer-form.js";

describe("parseNumberField", () => {
  it.each([
    ["", "空欄"],
    ["   ", "空欄"],
    ["１２", "半角"],
    ["12．5", "半角"],
    ["abc", "数字以外"],
    ["12mm", "数字以外"],
    ["1e400", "大きすぎ"],
    ["-5", "0より大きい"],
    ["0", "0より大きい"],
  ])("「%s」は止めて理由を出す（%s）", (text, reason) => {
    const result = parseNumberField(text, "厚さ");
    expect(result.ok).toBe(false);
    expect(result.message).toContain(reason);
  });

  it("上限を超えたら止める", () => {
    expect(parseNumberField("2000", "厚さ", { max: 1000 }).ok).toBe(false);
  });

  it("正しい数値は読める", () => {
    expect(parseNumberField(" 12.5 ", "厚さ")).toEqual({ ok: true, value: 12.5 });
    expect(parseNumberField("0", "損失係数", { allowZero: true })).toEqual({ ok: true, value: 0 });
    expect(parseNumberField(".5", "x")).toEqual({ ok: true, value: 0.5 });
  });

  it("数値以外の入力（null など）でも落ちない", () => {
    expect(parseNumberField(null, "厚さ").ok).toBe(false);
    expect(parseNumberField(undefined, "厚さ").ok).toBe(false);
  });

  it("単位変換", () => {
    expect(mmToM(12.5)).toBeCloseTo(0.0125, 15);
    expect(percentToRatio(8.7)).toBeCloseTo(0.087, 15);
  });
});

describe("toCoreLayer", () => {
  it("板：臨界周波数×板厚 0 は重さだけ、値があれば曲げ剛性を計算", () => {
    const texts = {
      thickness: "12.5",
      surfaceDensity: "10",
      coincidenceProduct: "0",
      lossFactor: "0.01",
    };
    expect(toCoreLayer({ kind: "plate", texts }, 0)).toEqual({
      ok: true,
      layer: {
        kind: "plate",
        surfaceDensityKgm2: 10,
        bendingStiffnessNm: 0,
        lossFactorRatio: 0.01,
      },
    });
    const stiff = toCoreLayer({ kind: "plate", texts: { ...texts, coincidenceProduct: "38" } }, 0);
    // fc = 38 / 0.0125 = 3040 Hz、B = c⁴·m / (2π·fc)²
    expect(stiff.layer.bendingStiffnessNm).toBeCloseTo(
      (343.2 ** 4 * 10) / (2 * Math.PI * 3040) ** 2,
      6,
    );
  });

  it("mm と % を SI に変換する", () => {
    expect(
      toCoreLayer({ kind: "air", texts: { thickness: "50" } }, 0).layer.thicknessM,
    ).toBeCloseTo(0.05, 15);
    const perforated = toCoreLayer(
      { kind: "perforated", texts: { thickness: "5.5", holeDiameter: "5", perforation: "8.7" } },
      0,
    );
    expect(perforated.layer).toEqual({
      kind: "perforated",
      thicknessM: 0.0055,
      holeDiameterM: 0.005,
      perforationRatio: 0.087,
    });
  });

  it("入力の誤りは行番号つきで全部返す", () => {
    const result = toCoreLayer(
      { kind: "porous", texts: { thickness: "", flowResistivity: "abc" } },
      2,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toContain("3層目");
  });

  it("未知の種類は止める", () => {
    expect(toCoreLayer({ kind: "concrete", texts: {} }, 0).ok).toBe(false);
  });
});
