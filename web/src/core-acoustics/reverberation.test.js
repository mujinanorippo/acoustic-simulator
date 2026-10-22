// 残響式（ブラウザ側）の二重実装照合・物理検証・意図的エラー・ランダム入力テスト
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import cases from "../../../tests/data/crosscheck/reverberation.cases.json" with { type: "json" };
import expected from "../../../tests/data/crosscheck/reverberation.expected.json" with { type: "json" };
import { ERROR_CODES } from "./errors.js";
import {
  rectangularRoom,
  reverberationTimeArauPuchades,
  reverberationTimeEyring,
  reverberationTimeFitzroy,
  reverberationTimeSabine,
  reverberationTimes,
  sabineCoefficientSPerM,
} from "./reverberation.js";

// 二重実装照合の許容差（同じ式を別言語で実装。差は丸め誤差だけのはず）
const CROSSCHECK_RELATIVE_TOLERANCE = 1e-9;
const FACES = ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"];
const uniform = (alpha) => Object.fromEntries(FACES.map((face) => [face, alpha]));
const sixTatami = (faces) =>
  rectangularRoom({ lengthXM: 3.64, widthYM: 2.73, heightZM: 2.4 }, faces);

function expectRelativeClose(actual, wanted, tolerance) {
  if (wanted === 0) {
    expect(actual).toBe(0);
    return;
  }
  expect(Math.abs(actual - wanted) / Math.abs(wanted)).toBeLessThanOrEqual(tolerance);
}

function expectErrorCode(action, code) {
  expect(action).toThrow(expect.objectContaining({ code }));
}

describe("二重実装照合（照合用 Python の期待値と比べる）", () => {
  it("入力と期待値の件数が同じ", () => {
    expect(expected.results).toHaveLength(cases.cases.length);
  });

  it.each(cases.cases.map((item, index) => [item.id, item, expected.results[index]]))(
    "%s",
    (_id, item, wanted) => {
      expect(wanted.id).toBe(item.id);
      const result = reverberationTimes(rectangularRoom(item.room, item.faceAbsorption));
      for (const key of ["sabineS", "eyringS", "fitzroyS", "arauPuchadesS"]) {
        expectRelativeClose(result[key], wanted[key], CROSSCHECK_RELATIVE_TOLERANCE);
      }
    },
  );
});

describe("物理検証", () => {
  it("24·ln(10)/c は文献の定数 0.161 と一致（Prawda ほか SMC 2020 式(1)）", () => {
    expectRelativeClose(sabineCoefficientSPerM(), 0.161, 1e-3);
  });

  it.each([0.01, 0.1, 0.3, 0.6, 0.95])(
    "吸音が一様（α=%f）なら Fitzroy・Arau は Eyring と同じ",
    (alpha) => {
      const room = sixTatami(uniform(alpha));
      const eyring = reverberationTimeEyring(room);
      expectRelativeClose(reverberationTimeFitzroy(room), eyring, 1e-12);
      expectRelativeClose(reverberationTimeArauPuchades(room), eyring, 1e-12);
    },
  );

  it("吸音が小さいと Eyring は Sabine に近づく", () => {
    const room = sixTatami(uniform(1e-6));
    expectRelativeClose(reverberationTimeEyring(room) / reverberationTimeSabine(room), 1, 1e-6);
  });

  it("6畳・全面 α=0.05 の手計算と一致", () => {
    const volume = 3.64 * 2.73 * 2.4;
    const area = 2 * (3.64 * 2.73 + 3.64 * 2.4 + 2.73 * 2.4);
    const wanted = ((24 * Math.LN10) / 343.2) * (volume / (area * 0.05));
    expectRelativeClose(reverberationTimeSabine(sixTatami(uniform(0.05))), wanted, 1e-12);
  });

  it("全面が完全吸音なら Eyring 系は 0 秒", () => {
    const room = sixTatami(uniform(1));
    expect(reverberationTimeEyring(room)).toBe(0);
    expect(reverberationTimeFitzroy(room)).toBe(0);
    expect(reverberationTimeArauPuchades(room)).toBe(0);
  });
});

describe("ランダム入力（性質のテスト）", () => {
  const ratio = fc.double({ min: 0.01, max: 0.99, noNaN: true });
  const length = fc.double({ min: 0.3, max: 30, noNaN: true });

  it("Eyring < Sabine、Fitzroy ≥ Arau、すべて有限", () => {
    fc.assert(
      fc.property(
        length,
        length,
        length,
        fc.array(ratio, { minLength: 6, maxLength: 6 }),
        (lx, wy, hz, alphas) => {
          const faces = Object.fromEntries(FACES.map((face, i) => [face, alphas[i]]));
          const times = reverberationTimes(
            rectangularRoom({ lengthXM: lx, widthYM: wy, heightZM: hz }, faces),
          );
          expect(times.eyringS).toBeGreaterThan(0);
          expect(times.eyringS).toBeLessThan(times.sabineS);
          expect(times.fitzroyS).toBeGreaterThanOrEqual(times.arauPuchadesS * (1 - 1e-12));
          Object.values(times).forEach((value) => expect(Number.isFinite(value)).toBe(true));
        },
      ),
    );
  });

  it("寸法を k 倍すると残響時間も k 倍", () => {
    fc.assert(
      fc.property(
        length,
        length,
        length,
        ratio,
        fc.double({ min: 1.1, max: 10, noNaN: true }),
        (lx, wy, hz, alpha, k) => {
          const small = rectangularRoom(
            { lengthXM: lx, widthYM: wy, heightZM: hz },
            uniform(alpha),
          );
          const large = rectangularRoom(
            { lengthXM: lx * k, widthYM: wy * k, heightZM: hz * k },
            uniform(alpha),
          );
          expectRelativeClose(
            reverberationTimeEyring(large),
            reverberationTimeEyring(small) * k,
            1e-9,
          );
        },
      ),
    );
  });
});

describe("意図的エラー（計算せずに番号付きエラーを返す）", () => {
  it.each([0, -1, Number.NaN, Infinity, "3", null, undefined, true])("寸法 %s は不可", (bad) => {
    expectErrorCode(
      () => rectangularRoom({ lengthXM: bad, widthYM: 2, heightZM: 2 }, uniform(0.1)),
      ERROR_CODES.NOT_POSITIVE_LENGTH,
    );
  });

  it.each([-0.01, 1.01, Number.NaN, Infinity, "0.5", null, undefined])(
    "吸音率 %s は不可",
    (bad) => {
      expectErrorCode(
        () =>
          rectangularRoom(
            { lengthXM: 3, widthYM: 3, heightZM: 2.4 },
            { ...uniform(0.1), zMin: bad },
          ),
        ERROR_CODES.ABSORPTION_OUT_OF_RANGE,
      );
    },
  );

  it("吸音ゼロは残響時間が無限大になるので不可", () => {
    const room = sixTatami(uniform(0));
    for (const formula of [
      reverberationTimeSabine,
      reverberationTimeEyring,
      reverberationTimeFitzroy,
      reverberationTimeArauPuchades,
    ]) {
      expectErrorCode(() => formula(room), ERROR_CODES.NO_ABSORPTION);
    }
  });

  it("1軸だけ吸音ゼロなら Sabine は計算でき、Fitzroy は不可", () => {
    const room = sixTatami({ ...uniform(0.3), xMin: 0, xMax: 0 });
    expect(reverberationTimeSabine(room)).toBeGreaterThan(0);
    expectErrorCode(() => reverberationTimeFitzroy(room), ERROR_CODES.NO_ABSORPTION);
  });

  it("面が足りない部屋は Arau-Puchades 不可", () => {
    const room = {
      volumeM3: 10,
      surfaces: [
        { areaM2: 10, absorptionRatio: 0.2, axis: "x" },
        { areaM2: 10, absorptionRatio: 0.2, axis: "y" },
      ],
    };
    expect(reverberationTimeSabine(room)).toBeGreaterThan(0);
    expectErrorCode(() => reverberationTimeArauPuchades(room), ERROR_CODES.MISSING_AXIS);
  });

  it("面が空・体積が不正なら不可", () => {
    expectErrorCode(
      () => reverberationTimeSabine({ volumeM3: 10, surfaces: [] }),
      ERROR_CODES.NOT_POSITIVE_LENGTH,
    );
    expectErrorCode(
      () =>
        reverberationTimeSabine({ volumeM3: -1, surfaces: [{ areaM2: 1, absorptionRatio: 0.1 }] }),
      ERROR_CODES.NOT_POSITIVE_LENGTH,
    );
  });

  it.each([0, -343, Number.NaN])("音速 %s は不可", (bad) => {
    expectErrorCode(
      () => reverberationTimeSabine(sixTatami(uniform(0.2)), bad),
      ERROR_CODES.NOT_POSITIVE_PROPERTY,
    );
  });
});
