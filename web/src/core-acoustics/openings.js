// 開口部による遮音低下（仕様書「解析機能：開口部による遮音低下」）
//
// 合成透過損失 TL = 10·log10(ΣS_i / ΣS_i·10^(−TL_i/10))
//   出典: Arup Strutt Help「Composite TL」 https://strutt.arup.com/help/Building_Acoustics/CompositeTL_BA.htm
// 開口部（穴・すきま）は音をそのまま通すとみなし、透過率 τ = 1（TL = 0 dB）とする。
// すきまの奥行きや共鳴による補正（Gomperts・Wilson-Soroka モデル）は入れていない（後のフェーズ）。
import { AcousticsInputError, ERROR_CODES, requirePositiveFinite, requireRatio } from "./errors.js";

const DB_PER_DECADE = 10;
const PERCENT = 100;
// 開口部の透過損失（τ = 1）
const OPEN_TRANSMISSION_LOSS_DB = 0;

function requireFiniteDb(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AcousticsInputError(
      ERROR_CODES.NOT_POSITIVE_PROPERTY,
      `${label} は数値で入力してください`,
    );
  }
  return value;
}

/** 面ごとの { areaM2, transmissionLossDb } から合成透過損失 [dB] */
export function compositeTransmissionLossDb(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new AcousticsInputError(ERROR_CODES.NOT_POSITIVE_LENGTH, "面が1つもありません");
  }
  let totalAreaM2 = 0;
  let transmittedAreaM2 = 0;
  parts.forEach((part, index) => {
    requirePositiveFinite(part.areaM2, ERROR_CODES.NOT_POSITIVE_LENGTH, `面${index + 1}の面積`);
    const lossDb = requireFiniteDb(part.transmissionLossDb, `面${index + 1}の透過損失`);
    totalAreaM2 += part.areaM2;
    transmittedAreaM2 += part.areaM2 * DB_PER_DECADE ** (-lossDb / DB_PER_DECADE);
  });
  return DB_PER_DECADE * Math.log10(totalAreaM2 / transmittedAreaM2);
}

/**
 * 透過損失 wallTlDb の壁に、面積比 openingRatio（0〜1）の開口部があるときの遮音低下。
 * 戻り値: 合成透過損失、元の壁からの低下量 [dB]、低下の割合（dB の比）、透過する音のエネルギーが何倍か
 */
export function openingReduction(wallTlDb, openingRatio) {
  requireFiniteDb(wallTlDb, "壁の透過損失");
  const ratio = requireRatio(openingRatio, "開口率");
  const compositeTlDb =
    ratio === 1
      ? OPEN_TRANSMISSION_LOSS_DB
      : compositeTransmissionLossDb(
          [
            { areaM2: 1 - ratio, transmissionLossDb: wallTlDb },
            { areaM2: ratio, transmissionLossDb: OPEN_TRANSMISSION_LOSS_DB },
          ].filter((part) => part.areaM2 > 0),
        );
  const reductionDb = wallTlDb - compositeTlDb;
  return {
    compositeTlDb,
    reductionDb,
    reductionPercent: wallTlDb === 0 ? 0 : (PERCENT * reductionDb) / wallTlDb,
    transmittedEnergyFactor: DB_PER_DECADE ** (reductionDb / DB_PER_DECADE),
  };
}
