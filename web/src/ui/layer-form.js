// 積層の入力行 → 計算コアの層データへの変換と、材料を選んだときの参考値の自動入力
// （画面に触れない純粋な関数）。入力の上限は「打ち間違いを止めるための範囲」で、物理的な限界値ではない。
import { findMaterial, materialsOf, plateSurfaceDensityKgm2 } from "../core-acoustics/materials.js";
import { bendingStiffnessFromCoincidenceNm } from "../core-acoustics/tmm.js";
import { mmToM, parseNumberField, percentToRatio } from "./forms.js";

const MM_PER_M = 1000;

export const LAYER_KINDS = Object.freeze({
  plate: {
    label: "板",
    materialCategory: "plate",
    fields: [
      { key: "thickness", label: "板厚", unit: "mm", max: 1000 },
      { key: "surfaceDensity", label: "面密度", unit: "kg/m²", max: 1000 },
      {
        key: "coincidenceProduct",
        label: "臨界周波数×板厚",
        unit: "m/s",
        max: 1000,
        allowZero: true,
        help: "材料の硬さの目安。材料を選ぶと入ります。0 にすると曲げの硬さを無視して重さだけで計算します",
      },
      {
        key: "lossFactor",
        label: "損失係数",
        unit: "",
        max: 1,
        allowZero: true,
        help: "板が揺れたとき、その揺れが熱になって消える割合。大きいほどコインシデンス（特定の高さの音で遮音が落ちる現象）の落ち込みが浅くなります",
      },
    ],
  },
  air: {
    label: "空気層",
    materialCategory: null,
    fields: [{ key: "thickness", label: "厚さ", unit: "mm", max: 1000 }],
  },
  porous: {
    label: "多孔質材",
    materialCategory: "porous",
    fields: [
      { key: "thickness", label: "厚さ", unit: "mm", max: 1000 },
      {
        key: "flowResistivity",
        label: "流れ抵抗",
        unit: "Pa·s/m²",
        max: 1e7,
        help: "空気の通りにくさ。材料を選ぶと測定例の値が入ります（表の例では密度が高いほど大きい）",
      },
    ],
  },
  perforated: {
    label: "有孔板",
    materialCategory: null,
    fields: [
      { key: "thickness", label: "板厚", unit: "mm", max: 100 },
      { key: "holeDiameter", label: "穴径", unit: "mm", max: 100 },
      { key: "perforation", label: "開口率", unit: "%", max: 100 },
    ],
  },
});

/** 層の種類ごとに選べる材料（無ければ空） */
export function materialChoices(kind) {
  const category = LAYER_KINDS[kind]?.materialCategory;
  return category ? materialsOf(category) : [];
}

function formatNumber(value) {
  return String(Number(value.toPrecision(6)));
}

/**
 * 材料を選んだ行を作る。材料の値を入力欄に入れ、その欄を「参考値」として印を付ける。
 * materialId が空なら「自分で入力」：入力欄はそのまま、参考値の印だけ外す。
 */
export function applyMaterial(row, materialId) {
  const material = findMaterial(materialId);
  if (!material) {
    return { ...row, materialId: "", referenceKeys: [] };
  }
  const texts = { ...row.texts };
  const referenceKeys = [];
  const put = (key, value) => {
    texts[key] = formatNumber(value);
    referenceKeys.push(key);
  };
  if (material.category === "plate") {
    put("thickness", material.values.thickness * MM_PER_M);
    put("surfaceDensity", plateSurfaceDensityKgm2(material, material.values.thickness));
    put("coincidenceProduct", material.values.coincidenceProduct);
    put("lossFactor", material.values.lossFactor);
  } else if (material.category === "porous") {
    put("flowResistivity", material.values.flowResistivity);
  }
  return { ...row, materialId, texts, referenceKeys };
}

/** 入力欄を自分で書き換えたら、その欄は参考値ではなくなる */
export function editField(row, key, text) {
  return {
    ...row,
    texts: { ...row.texts, [key]: text },
    referenceKeys: (row.referenceKeys ?? []).filter((item) => item !== key),
  };
}

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
  return {
    kind: "plate",
    surfaceDensityKgm2: values.surfaceDensity,
    bendingStiffnessNm: bendingStiffnessFromCoincidenceNm(
      values.surfaceDensity,
      values.coincidenceProduct,
      mmToM(values.thickness),
    ),
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

/** 材料データのうち、参考値として表示した値に「暫定」「二次情報」が含まれるか */
export function rowUsesTentativeValues(row) {
  const material = findMaterial(row.materialId);
  return Boolean(material?.isTentative) && (row.referenceKeys ?? []).length > 0;
}
