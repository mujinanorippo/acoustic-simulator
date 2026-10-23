"""1/3オクターブ帯域。

出典: IEC 61260-1:2014 の10進法の定義（acoustic-toolbox の解説で確認）
  fm = fr · G^(x/b)（b が奇数）、帯域端 fm · G^(±1/(2b))、G = 10^0.3
  https://acoustic-toolbox.readthedocs.io/en/latest/standards/iec_61260_1_2014/
"""

from __future__ import annotations

from . import constants as const
from .errors import BAND_OUT_OF_RANGE, AcousticsInputError

# G = 10^0.3 の底（10進法の定義）
DECIMAL_BASE = 10.0
HALF = 0.5


def exact_center_frequency_hz(band_index: int) -> float:
    if (
        not isinstance(band_index, int)
        or isinstance(band_index, bool)
        or not const.BAND_INDEX_MIN <= band_index <= const.BAND_INDEX_MAX
    ):
        raise AcousticsInputError(BAND_OUT_OF_RANGE, f"帯域番号 {band_index} は帯域表の範囲外です")
    exponent = const.OCTAVE_RATIO_LOG10 * band_index / const.BANDS_PER_OCTAVE
    return const.REFERENCE_FREQUENCY_HZ * DECIMAL_BASE**exponent


def band_edges_hz(band_index: int) -> tuple[float, float]:
    center_hz = exact_center_frequency_hz(band_index)
    half_band_ratio = DECIMAL_BASE ** (const.OCTAVE_RATIO_LOG10 * HALF / const.BANDS_PER_OCTAVE)
    return center_hz / half_band_ratio, center_hz * half_band_ratio


def band_indices() -> list[int]:
    return list(range(const.BAND_INDEX_MIN, const.BAND_INDEX_MAX + 1))
