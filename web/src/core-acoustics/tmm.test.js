// 伝達マトリクス法（ブラウザ側）の二重実装照合・物理検証・意図的エラー
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import cases from "../../../tests/data/crosscheck/tmm.cases.json" with { type: "json" };
import expected from "../../../tests/data/crosscheck/tmm.expected.json" with { type: "json" };
import { besselJSeries, besselRatioJ1OverJ0 } from "./bessel.js";
import * as cx from "./complex.js";
import { AIR } from "./constants.js";
import { ERROR_CODES } from "./errors.js";
import { airViscosityPas, interactionFactor, mikiEquivalentFluid } from "./layer-models.js";
import {
  bandTransmissionLossDb,
  bendingStiffnessNm,
  criticalFrequencyHz,
  diffuseTransmissionCoefficient,
  massAirMassResonanceHz,
  normalIncidenceAbsorptionRigidBacked,
  porousLayersOutOfRange,
  transmissionCoefficient,
  transmissionLossDb,
} from "./tmm.js";

// 二重実装照合の許容差
//   同じ式の点ごとの値（垂直・斜め入射の透過率、吸音率）: 相対 1e-9
//   数値積分を含む値（拡散入射・帯域の透過損失）: 両実装で積分法が違うため 0.01 dB
const POINT_RELATIVE_TOLERANCE = 1e-9;
const INTEGRATED_TOLERANCE_DB = 0.01;
const BAND_INDICES = [-10, 0, 5];
const Z0 = AIR.densityKgm3 * AIR.speedOfSoundMps;

// 拡散入射の積分を多数回行うため、他のテストと並行して動くと数秒かかる
const HEAVY_TEST_TIMEOUT_MS = 60000;

const relative = (actual, wanted) => Math.abs(actual - wanted) / Math.abs(wanted);
const plate = (mass, stiffness = 0, loss = 0) => ({
  kind: "plate",
  surfaceDensityKgm2: mass,
  bendingStiffnessNm: stiffness,
  lossFactorRatio: loss,
});
const air = (thickness) => ({ kind: "air", thicknessM: thickness });

describe("二重実装照合（照合用 Python の期待値と比べる）", () => {
  const oblique = (cases.obliqueAngleDeg * Math.PI) / 180;
  it.each(cases.cases.map((item, index) => [item.id, item, expected.results[index]]))(
    "%s",
    (_id, item, wanted) => {
      expect(wanted.id).toBe(item.id);
      item.frequenciesHz.forEach((frequency, index) => {
        const point = wanted.points[index];
        if (item.transmission) {
          const tauNormal = transmissionCoefficient(item.layers, frequency);
          expect(relative(tauNormal, point.tauNormal)).toBeLessThan(POINT_RELATIVE_TOLERANCE);
          const tauOblique = transmissionCoefficient(item.layers, frequency, oblique);
          expect(relative(tauOblique, point.tauOblique)).toBeLessThan(POINT_RELATIVE_TOLERANCE);
          const diffuseDb = transmissionLossDb(
            diffuseTransmissionCoefficient(item.layers, frequency),
          );
          expect(Math.abs(diffuseDb - point.diffuseTlDb)).toBeLessThan(INTEGRATED_TOLERANCE_DB);
        }
        if (item.absorption) {
          const alpha = normalIncidenceAbsorptionRigidBacked(item.layers, frequency);
          expect(relative(alpha, point.absorptionNormal)).toBeLessThan(POINT_RELATIVE_TOLERANCE);
        }
      });
      if (item.transmission) {
        BAND_INDICES.forEach((band, index) => {
          const bandDb = bandTransmissionLossDb(item.layers, band);
          expect(Math.abs(bandDb - wanted.bandTlDb[index])).toBeLessThan(INTEGRATED_TOLERANCE_DB);
        });
      }
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

describe("物理検証", () => {
  const massLawNormalDb = (mass, frequency) =>
    10 * Math.log10(1 + ((2 * Math.PI * frequency * mass) / (2 * Z0)) ** 2);

  it.each([63, 250, 1000, 4000])(
    "質量だけの板の垂直入射は質量則の厳密式と一致（%i Hz）",
    (frequency) => {
      // τ = 1/(1 + (ωm/2ρc)²)（Lund Univ. VTAN01、VAC Kentucky の質量則）
      const tlDb = transmissionLossDb(transmissionCoefficient([plate(10)], frequency));
      expect(Math.abs(tlDb - massLawNormalDb(10, frequency))).toBeLessThan(1e-9);
    },
  );

  it.each([500, 1000, 2000])(
    "field incidence は垂直入射よりおよそ 5.5 dB 低い（%i Hz）",
    (frequency) => {
      // VAC Kentucky「TL_field = TL0 − 5.5 dB」（ωm ≫ ρc の範囲）
      const normalDb = transmissionLossDb(transmissionCoefficient([plate(10)], frequency));
      const fieldDb = transmissionLossDb(diffuseTransmissionCoefficient([plate(10)], frequency));
      expect(Math.abs(normalDb - fieldDb - 5.5)).toBeLessThan(0.5);
    },
  );

  it("損失のない板はコインシデンス角で全透過する", () => {
    const stiffness = bendingStiffnessNm({
      youngsModulusPa: 2.5e9,
      poissonRatio: 0.3,
      thicknessM: 0.0125,
    });
    const critical = criticalFrequencyHz(10, stiffness);
    const frequency = 2 * critical;
    const angle = Math.asin(Math.sqrt(critical / frequency));
    expect(transmissionCoefficient([plate(10, stiffness, 0)], frequency, angle)).toBeCloseTo(1, 9);
  });

  it("二重壁の透過のピークは質量-空気-質量の共鳴周波数（垂直入射）", () => {
    const layers = [plate(20), air(0.05), plate(10)];
    const f0 = massAirMassResonanceHz(20, 10, 0.05);
    let best = { frequency: 0, tau: 0 };
    for (let frequency = 20; frequency <= 400; frequency += 0.05) {
      const tau = transmissionCoefficient(layers, frequency);
      if (tau > best.tau) best = { frequency, tau };
    }
    // 空気層を薄いばねとみなした式なので、kd ≪ 1 の範囲で数%の差は残る
    expect(Math.abs(best.frequency / f0 - 1)).toBeLessThan(0.05);
  });

  it("板だけを剛壁に付けても吸音しない", () => {
    expect(normalIncidenceAbsorptionRigidBacked([plate(10)], 500)).toBe(0);
  });

  it("空気層だけなら音はそのまま通り、剛壁の前の空気層は吸音しない", () => {
    expect(transmissionCoefficient([air(0.1)], 500, 0.3)).toBeCloseTo(1, 12);
    expect(normalIncidenceAbsorptionRigidBacked([air(0.1)], 500)).toBeCloseTo(0, 12);
  });

  it("Miki モデルの特性インピーダンスの実部は正（受動的な材料）", () => {
    for (const frequency of [10, 100, 1000, 10000]) {
      for (const resistivity of [1000, 10000, 100000]) {
        expect(mikiEquivalentFluid(frequency, resistivity).impedance.re).toBeGreaterThan(0);
        expect(mikiEquivalentFluid(frequency, resistivity).wavenumber.im).toBeLessThan(0);
      }
    }
  });

  it("20 °C の空気の粘性係数は Sutherland の式で約 1.81×10⁻⁵ Pa·s", () => {
    expect(airViscosityPas()).toBeCloseTo(1.8133e-5, 8);
  });

  it("穴どうしの干渉補正は開口率 0 で 1、開口率 1 で 0", () => {
    expect(interactionFactor(0)).toBe(1);
    expect(Math.abs(interactionFactor(1))).toBeLessThan(1e-12);
  });
});

describe("Miki モデルの適用範囲", () => {
  it("f/σ が 0.01 未満の層を範囲外として知らせる", () => {
    const layers = [
      { kind: "porous", thicknessM: 0.005, flowResistivityPasm2: 100000 },
      air(0.05),
      { kind: "porous", thicknessM: 0.05, flowResistivityPasm2: 10000 },
    ];
    expect(porousLayersOutOfRange(layers, 50)).toEqual([0, 2]);
    expect(porousLayersOutOfRange(layers, 1000)).toEqual([]);
  });

  it("範囲外ではごくわずかに物理的でない値が出る（Kirby 2014 の指摘と一致）", () => {
    const alpha = normalIncidenceAbsorptionRigidBacked(
      [{ kind: "porous", thicknessM: 0.005, flowResistivityPasm2: 100000 }],
      50,
    );
    expect(alpha).toBeLessThan(0);
    expect(alpha).toBeGreaterThan(-1e-3);
  });
});

describe("ベッセル関数の比 J1/J0", () => {
  const SQRT_MINUS_J = cx.complex(Math.SQRT1_2, -Math.SQRT1_2);

  it.each([0.1, 1, 3, 6, 10])("|z| = %f では級数展開と一致", (size) => {
    const argument = cx.scale(SQRT_MINUS_J, size);
    const series = cx.div(besselJSeries(1, argument, 80), besselJSeries(0, argument, 80));
    const ratio = besselRatioJ1OverJ0(argument);
    expect(cx.abs(cx.sub(ratio, series)) / cx.abs(series)).toBeLessThan(1e-12);
  });

  it("|z| が大きいと J1/J0 → −j（桁あふれしない）", () => {
    const ratio = besselRatioJ1OverJ0(cx.scale(SQRT_MINUS_J, 1000));
    expect(cx.abs(cx.sub(ratio, cx.complex(0, -1)))).toBeLessThan(1e-3);
  });
});

describe("ランダム入力（性質のテスト）", () => {
  const layerArbitrary = fc.oneof(
    fc.record({
      kind: fc.constant("plate"),
      surfaceDensityKgm2: fc.double({ min: 0.5, max: 100, noNaN: true }),
      bendingStiffnessNm: fc.double({ min: 0, max: 1e5, noNaN: true }),
      lossFactorRatio: fc.double({ min: 0, max: 0.5, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant("air"),
      thicknessM: fc.double({ min: 0.001, max: 0.3, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant("porous"),
      thicknessM: fc.double({ min: 0.005, max: 0.2, noNaN: true }),
      flowResistivityPasm2: fc.double({ min: 1000, max: 100000, noNaN: true }),
    }),
  );

  it("透過率は 0〜1、吸音率は 0〜1（エネルギーが増えない）", () => {
    fc.assert(
      fc.property(
        fc.array(layerArbitrary, { minLength: 1, maxLength: 4 }),
        fc.double({ min: 50, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 1.5, noNaN: true }),
        (layers, frequency, angle) => {
          // Miki モデルの適用範囲外（f/σ < 0.01）では受動性が保証されないので除く
          fc.pre(porousLayersOutOfRange(layers, frequency).length === 0);
          const tau = transmissionCoefficient(layers, frequency, angle);
          expect(tau).toBeGreaterThanOrEqual(0);
          expect(tau).toBeLessThanOrEqual(1 + 1e-9);
          const alpha = normalIncidenceAbsorptionRigidBacked(layers, frequency);
          expect(alpha).toBeGreaterThanOrEqual(-1e-9);
          expect(alpha).toBeLessThanOrEqual(1 + 1e-9);
        },
      ),
    );
  });
});

describe("意図的エラー", () => {
  const expectCode = (action, code) => expect(action).toThrow(expect.objectContaining({ code }));

  it("層なし・未知の層は不可", () => {
    expectCode(() => transmissionCoefficient([], 500), ERROR_CODES.UNKNOWN_LAYER);
    expectCode(() => transmissionCoefficient(null, 500), ERROR_CODES.UNKNOWN_LAYER);
    expectCode(
      () => transmissionCoefficient([{ kind: "concrete" }], 500),
      ERROR_CODES.UNKNOWN_LAYER,
    );
  });

  it.each([0, -1, Number.NaN, "10", null])("厚さ %s の層は不可", (bad) => {
    expectCode(() => transmissionCoefficient([air(bad)], 500), ERROR_CODES.NOT_POSITIVE_LENGTH);
  });

  it.each([0, -5, Number.NaN, Infinity])("面密度 %s は不可", (bad) => {
    expectCode(() => transmissionCoefficient([plate(bad)], 500), ERROR_CODES.NOT_POSITIVE_PROPERTY);
  });

  it.each([-1, Number.NaN])("曲げ剛性 %s は不可", (bad) => {
    expectCode(
      () => transmissionCoefficient([plate(10, bad)], 500),
      ERROR_CODES.NOT_POSITIVE_PROPERTY,
    );
  });

  it.each([-0.1, 1.5, Number.NaN])("損失係数 %s は不可", (bad) => {
    expectCode(
      () => transmissionCoefficient([plate(10, 0, bad)], 500),
      ERROR_CODES.ABSORPTION_OUT_OF_RANGE,
    );
  });

  it.each([0, 1.2, -0.1])("有孔板の開口率 %s は不可", (bad) => {
    const layer = {
      kind: "perforated",
      thicknessM: 0.005,
      holeDiameterM: 0.005,
      perforationRatio: bad,
    };
    expect(() => transmissionCoefficient([layer], 500)).toThrow(/E-CALC-002/);
  });

  it.each([0, -100, Number.NaN])("周波数 %s は不可", (bad) => {
    expectCode(() => transmissionCoefficient([plate(10)], bad), ERROR_CODES.NOT_POSITIVE_FREQUENCY);
    expectCode(
      () => diffuseTransmissionCoefficient([plate(10)], bad),
      ERROR_CODES.NOT_POSITIVE_FREQUENCY,
    );
  });

  it.each([-0.1, Math.PI / 2, 2, Number.NaN])("入射角 %s rad は不可", (bad) => {
    expectCode(() => transmissionCoefficient([plate(10)], 500, bad), ERROR_CODES.INVALID_ANGLE);
  });

  it("流れ抵抗 0 の多孔質材は不可", () => {
    expectCode(
      () =>
        transmissionCoefficient(
          [{ kind: "porous", thicknessM: 0.05, flowResistivityPasm2: 0 }],
          500,
        ),
      ERROR_CODES.NOT_POSITIVE_PROPERTY,
    );
  });

  it("極端に厚い多孔質材は数値範囲外として止める", () => {
    expectCode(
      () =>
        transmissionCoefficient(
          [{ kind: "porous", thicknessM: 1000, flowResistivityPasm2: 100000 }],
          5000,
        ),
      ERROR_CODES.OUT_OF_NUMERIC_RANGE,
    );
  });
});
