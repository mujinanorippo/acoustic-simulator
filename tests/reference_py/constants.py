"""出典付き定数（shared/constants/）の読み込み。出典は各 JSON を参照。"""

from __future__ import annotations

import json
from pathlib import Path

CONSTANTS_DIR = Path(__file__).resolve().parents[2] / "shared" / "constants"


def _values(constant_id: str) -> dict[str, object]:
    data = json.loads((CONSTANTS_DIR / f"{constant_id}.json").read_text(encoding="utf-8"))
    return {key: item["value"] for key, item in data["values"].items()}


_AIR = _values("air")
AIR_TEMPERATURE_K: float = _AIR["temperature"]
AIR_SPEED_OF_SOUND_MPS: float = _AIR["speedOfSound"]
AIR_DENSITY_KGM3: float = _AIR["density"]
SUTHERLAND_REFERENCE_VISCOSITY_PAS: float = _AIR["sutherlandReferenceViscosity"]
SUTHERLAND_REFERENCE_TEMPERATURE_K: float = _AIR["sutherlandReferenceTemperature"]
SUTHERLAND_CONSTANT_K: float = _AIR["sutherlandConstant"]

FIELD_INCIDENCE_LIMIT_DEG: float = _values("calculation")["fieldIncidenceLimitAngle"]

_BANDS = _values("frequency-bands")
REFERENCE_FREQUENCY_HZ: float = _BANDS["referenceFrequency"]
OCTAVE_RATIO_LOG10: float = _BANDS["octaveRatioLog10"]
BANDS_PER_OCTAVE: int = _BANDS["bandsPerOctave"]
BAND_INDEX_MIN: int = _BANDS["bandIndexMin"]
BAND_INDEX_MAX: int = _BANDS["bandIndexMax"]
RATING_BAND_INDEX_MIN: int = _BANDS["ratingBandIndexMin"]
RATING_BAND_INDEX_MAX: int = _BANDS["ratingBandIndexMax"]
NOMINAL_CENTER_FREQUENCIES_HZ: tuple[float, ...] = tuple(_BANDS["nominalCenterFrequencies"])

_POROUS = _values("porous")
BIES_HANSEN_COEFFICIENT: float = _POROUS["biesHansenCoefficient"]
BIES_HANSEN_EXPONENT: float = _POROUS["biesHansenExponent"]
