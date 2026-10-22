"""計算コアの入力エラー（開発設計書「エラー処理方針」）。番号は docs/error-codes.md と共通。"""

from __future__ import annotations

import math

NOT_POSITIVE_LENGTH = "E-CALC-001"
ABSORPTION_OUT_OF_RANGE = "E-CALC-002"
NO_ABSORPTION = "E-CALC-003"
NOT_POSITIVE_PROPERTY = "E-CALC-004"
NOT_POSITIVE_FREQUENCY = "E-CALC-005"
MISSING_AXIS = "E-CALC-006"
BAND_OUT_OF_RANGE = "E-CALC-007"
UNKNOWN_LAYER = "E-CALC-008"
OUT_OF_NUMERIC_RANGE = "E-CALC-009"
INVALID_ANGLE = "E-CALC-010"


class AcousticsInputError(ValueError):
    """不正な入力。計算は行わない。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def _is_real_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def require_positive_finite(value: object, code: str, label: str) -> float:
    if not _is_real_number(value) or value <= 0:
        raise AcousticsInputError(code, f"{label} は正の数で入力してください（入力値: {value}）")
    return float(value)


def require_ratio(value: object, label: str) -> float:
    if not _is_real_number(value) or not 0 <= value <= 1:
        raise AcousticsInputError(
            ABSORPTION_OUT_OF_RANGE, f"{label} は 0〜1 の範囲で入力してください（入力値: {value}）"
        )
    return float(value)
