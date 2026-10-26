// 出典付き材料データ（shared/materials/*.json）の読み込みと分類
// 値ごとに出典・確認日・信頼度を持つ。信頼度が「暫定」「二次情報」の値を使った結果には、画面で
// 「暫定値を含む」「参考値」と示す（開発設計書「材料データ」）。
const files = import.meta.glob("../../../shared/materials/*.json", {
  eager: true,
  import: "default",
});

const TENTATIVE_RELIABILITIES = new Set(["暫定", "二次情報"]);

function categoryOf(properties) {
  if ("absorptionOctave" in properties) return "absorption";
  if ("flowResistivity" in properties || "fiberDiameter" in properties) return "porous";
  if ("coincidenceProduct" in properties) return "plate";
  return "other";
}

function toMaterial(data) {
  const values = Object.fromEntries(
    Object.entries(data.properties).map(([key, item]) => [key, item.value]),
  );
  return Object.freeze({
    id: data.id,
    name: data.name,
    category: categoryOf(data.properties),
    values: Object.freeze(values),
    sources: Object.freeze(data.properties),
    isTentative: Object.values(data.properties).some((item) =>
      TENTATIVE_RELIABILITIES.has(item.reliability),
    ),
  });
}

export const MATERIALS = Object.freeze(
  Object.values(files)
    .map(toMaterial)
    .sort((left, right) => left.name.localeCompare(right.name, "ja", { numeric: true })),
);

export function materialsOf(category) {
  return MATERIALS.filter((material) => material.category === category);
}

export function findMaterial(id) {
  return MATERIALS.find((material) => material.id === id) ?? null;
}

/** 板の面密度 [kg/m²]：材料データに面密度があればそれ、なければ密度×厚さ */
export function plateSurfaceDensityKgm2(material, thicknessM) {
  if ("surfaceDensity" in material.values) return material.values.surfaceDensity;
  return material.values.density * thicknessM;
}
