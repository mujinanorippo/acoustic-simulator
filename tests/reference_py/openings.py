"""開口部による遮音低下（照合用 Python）。

合成透過損失 TL = 10·log10(ΣS_i / ΣS_i·10^(−TL_i/10))
  出典: Arup Strutt Help「Composite TL」 https://strutt.arup.com/help/Building_Acoustics/CompositeTL_BA.htm
開口部は τ = 1（TL = 0 dB）とみなす。
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from .errors import (
    NOT_POSITIVE_LENGTH,
    NOT_POSITIVE_PROPERTY,
    OPENING_LARGER_THAN_WALL,
    AcousticsInputError,
    require_positive_finite,
    require_ratio,
)


def _finite(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise AcousticsInputError(NOT_POSITIVE_PROPERTY, f"{label} は数値で入力してください")
    return float(value)


def composite_transmission_loss_db(parts: Sequence[tuple[float, float]]) -> float:
    """parts は (面積 m², 透過損失 dB) の並び"""
    if not parts:
        raise AcousticsInputError(NOT_POSITIVE_LENGTH, "面が1つもありません")
    areas = [require_positive_finite(area, NOT_POSITIVE_LENGTH, "面積") for area, _ in parts]
    taus = [10 ** (-_finite(loss, "透過損失") / 10) for _, loss in parts]
    transmitted = math.fsum(area * tau for area, tau in zip(areas, taus, strict=True))
    return 10 * math.log10(math.fsum(areas) / transmitted)


def opening_reduction(wall_tl_db: float, opening_ratio: float) -> dict[str, float]:
    wall = _finite(wall_tl_db, "壁の透過損失")
    ratio = require_ratio(opening_ratio, "開口率")
    # 透過率の面積平均を直接計算する（ブラウザ側は合成透過損失の関数を経由する）
    mean_tau = (1 - ratio) * 10 ** (-wall / 10) + ratio
    composite = -10 * math.log10(mean_tau)
    reduction = wall - composite
    return {
        "compositeTlDb": composite,
        "reductionDb": reduction,
        "reductionPercent": 0.0 if wall == 0 else 100 * reduction / wall,
        "transmittedEnergyFactor": 10 ** (reduction / 10),
    }


def opening_ratio_from_areas(wall_area_m2: float, opening_area_m2: float) -> float:
    wall = require_positive_finite(wall_area_m2, NOT_POSITIVE_LENGTH, "壁の面積")
    opening = _finite(opening_area_m2, "開口部の面積")
    if opening < 0:
        raise AcousticsInputError(NOT_POSITIVE_LENGTH, "開口部の面積は 0 以上")
    if opening > wall:
        raise AcousticsInputError(OPENING_LARGER_THAN_WALL, "開口部の面積が壁の面積より大きい")
    return opening / wall
