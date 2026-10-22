// 積層の入力行 → 計算コアの層データへの変換（画面に触れない純粋な関数）
// 入力の上限は「打ち間違いを止めるための範囲」で、物理的な限界値ではない。
import { bendingStiffnessNm } from "../core-acoustics/tmm.js";
import { gpaToPa, mmToM, parseNumberField, percentToRatio } from "./forms.js";

export const LAYER_KINDS = Object.freeze({
  plate: {
    label: "板（遮音シート・石膏ボードなど）",
    fields: [
      { key: "surfaceDensity", label: "面密度", unit: "kg/m²", max: 1000 },
      { key: "youngsModulus", label: "ヤング率", unit: "GPa", max: 1000, allowZero: true },
      { key: "thickness", label: "板厚", unit: "mm", max: 1000 },
      { key: "poissonRatio", label: "ポアソン比", unit: "", max: 0.5, allowZero: true },
      { key: "lossFactor", label: "損失係数", unit: "", max: 1, allowZero: true },
    ],
  },
  air: {
    label: "空気層",
    fields: [{ key: "thickness", label: "厚さ", unit: "mm", max: 1000 }],
  },
  porous: {
    label: "多孔質材（グラスウールなど）",
    fields: [
      { key: "thickness", label: "厚さ", unit: "mm", max: 1000 },
      { key: "flowResistivity", label: "流れ抵抗", unit: "Pa·s/m²", max: 1e7 },
    ],
  },
  perforated: {
    label: "有孔板",
    fields: [
      { key: "thickness", label: "板厚", unit: "mm", max: 100 },
      { key: "holeDiameter", label: "穴径", unit: "mm", max: 100 },
      { key: "perforation", label: "開口率", unit: "%", max: 100 },
    ],
  },
});

function parseFields(kind, texts, rowLabel) {
  const values = {};
  const errors = [];
  for (const field of LAYER_KINDS[kind].fields) {
    const result = parseNumberField(texts[field.key], `${rowLabel}の${field.label}`, field);
    if (result.ok) {
      values[field.key] = result.value;
    } else {
      errors.push({ key: field.key, message: result.message });
    }
  }
  return { values, errors };
}

function plateLayer(values) {
  // ヤング率 0 は「曲げ剛性を無視して質量だけで計算する」指定
  const stiffness =
    values.youngsModulus === 0
      ? 0
      : bendingStiffnessNm({
          youngsModulusPa: gpaToPa(values.youngsModulus),
          poissonRatio: values.poissonRatio,
          thicknessM: mmToM(values.thickness),
        });
  return {
    kind: "plate",
    surfaceDensityKgm2: values.surfaceDensity,
    bendingStiffnessNm: stiffness,
    lossFactorRatio: values.lossFactor,
  };
}

/** 入力行 { kind, texts } → { ok, layer } または { ok: false, errors } */
export function toCoreLayer(row, index) {
  const rowLabel = `${index + 1}層目`;
  if (!Object.hasOwn(LAYER_KINDS, row.kind)) {
    return { ok: false, errors: [{ key: "kind", message: `${rowLabel}の種類を選んでください` }] };
  }
  const { values, errors } = parseFields(row.kind, row.texts, rowLabel);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  switch (row.kind) {
    case "plate":
      return { ok: true, layer: plateLayer(values) };
    case "air":
      return { ok: true, layer: { kind: "air", thicknessM: mmToM(values.thickness) } };
    case "porous":
      return {
        ok: true,
        layer: {
          kind: "porous",
          thicknessM: mmToM(values.thickness),
          flowResistivityPasm2: values.flowResistivity,
        },
      };
    default:
      return {
        ok: true,
        layer: {
          kind: "perforated",
          thicknessM: mmToM(values.thickness),
          holeDiameterM: mmToM(values.holeDiameter),
          perforationRatio: percentToRatio(values.perforation),
        },
      };
  }
}
