"""簡易残響時間（Sabine・Eyring・Fitzroy・Arau-Puchades）。空気吸収は含めない。

出典:
  Sabine・Eyring: pyrato（Kuttruff, Room Acoustics 4th ed. / Eyring, JASA 1, 1930）
    https://pyrato.readthedocs.io/en/stable/modules/parametric.html
  Fitzroy 式(5)・Arau-Puchades 式(6): Prawda, Schlecht, Välimäki, SMC 2020
    https://acris.aalto.fi/ws/portalfiles/portal/52515211/Evaluation_of_reverberation_time_models.pdf
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from . import constants as const
from .errors import (
    MISSING_AXIS,
    NO_ABSORPTION,
    NOT_POSITIVE_LENGTH,
    NOT_POSITIVE_PROPERTY,
    AcousticsInputError,
    require_positive_finite,
    require_ratio,
)

REVERBERATION_DECAY_DB = 60.0  # 残響時間の定義（60 dB 減衰）
DB_PER_DECADE = 10.0  # dB = 10·log10(エネルギー比)
MEAN_FREE_PATH_FACTOR = 4.0  # 平均自由行程 4V/S
AXES = ("x", "y", "z")


@dataclass(frozen=True)
class Surface:
    area_m2: float
    absorption_ratio: float
    axis: str | None = None


@dataclass(frozen=True)
class Room:
    volume_m3: float
    surfaces: tuple[Surface, ...]


def sabine_coefficient_s_per_m(speed_of_sound_mps: float = const.AIR_SPEED_OF_SOUND_MPS) -> float:
    """24·ln(10)/c [s/m]"""
    require_positive_finite(speed_of_sound_mps, NOT_POSITIVE_PROPERTY, "音速")
    decay_decades = REVERBERATION_DECAY_DB / DB_PER_DECADE
    return MEAN_FREE_PATH_FACTOR * decay_decades * math.log(10.0) / speed_of_sound_mps


def _check(room: Room) -> None:
    require_positive_finite(room.volume_m3, NOT_POSITIVE_LENGTH, "部屋の体積")
    if not room.surfaces:
        raise AcousticsInputError(NOT_POSITIVE_LENGTH, "面が1つもありません")
    for number, surface in enumerate(room.surfaces, start=1):
        require_positive_finite(surface.area_m2, NOT_POSITIVE_LENGTH, f"面{number}の面積")
        require_ratio(surface.absorption_ratio, f"面{number}の吸音率")


def _area_and_mean(surfaces: Sequence[Surface]) -> tuple[float, float]:
    area = math.fsum(surface.area_m2 for surface in surfaces)
    absorption = math.fsum(surface.area_m2 * surface.absorption_ratio for surface in surfaces)
    return area, absorption / area


def _require_absorption(mean_ratio: float, label: str) -> None:
    if mean_ratio <= 0:
        raise AcousticsInputError(
            NO_ABSORPTION, f"{label}の吸音がゼロのため残響時間が無限大になります"
        )


def _neg_log_one_minus(ratio: float) -> float:
    return math.inf if ratio >= 1 else -math.log1p(-ratio)


def sabine_s(room: Room, speed_of_sound_mps: float = const.AIR_SPEED_OF_SOUND_MPS) -> float:
    _check(room)
    area, mean = _area_and_mean(room.surfaces)
    _require_absorption(mean, "部屋全体")
    return sabine_coefficient_s_per_m(speed_of_sound_mps) * room.volume_m3 / (area * mean)


def eyring_s(room: Room, speed_of_sound_mps: float = const.AIR_SPEED_OF_SOUND_MPS) -> float:
    _check(room)
    area, mean = _area_and_mean(room.surfaces)
    _require_absorption(mean, "部屋全体")
    coefficient = sabine_coefficient_s_per_m(speed_of_sound_mps)
    return coefficient * room.volume_m3 / (area * _neg_log_one_minus(mean))


def _axis_groups(room: Room) -> list[tuple[float, float]]:
    groups = []
    for axis in AXES:
        members = [surface for surface in room.surfaces if surface.axis == axis]
        if not members:
            raise AcousticsInputError(MISSING_AXIS, f"{axis}軸に垂直な面がありません")
        area, mean = _area_and_mean(members)
        _require_absorption(mean, f"{axis}軸方向の面")
        groups.append((area, mean))
    return groups


def fitzroy_s(room: Room, speed_of_sound_mps: float = const.AIR_SPEED_OF_SOUND_MPS) -> float:
    _check(room)
    total_area, _ = _area_and_mean(room.surfaces)
    terms = [area / _neg_log_one_minus(mean) for area, mean in _axis_groups(room)]
    coefficient = sabine_coefficient_s_per_m(speed_of_sound_mps)
    return coefficient * room.volume_m3 / total_area**2 * math.fsum(terms)


def arau_puchades_s(room: Room, speed_of_sound_mps: float = const.AIR_SPEED_OF_SOUND_MPS) -> float:
    _check(room)
    total_area, _ = _area_and_mean(room.surfaces)
    coefficient = sabine_coefficient_s_per_m(speed_of_sound_mps)
    # 対数で積をとる（重み S_j/S の加重幾何平均）
    log_sum = 0.0
    for area, mean in _axis_groups(room):
        axis_time = coefficient * room.volume_m3 / (total_area * _neg_log_one_minus(mean))
        if axis_time == 0:
            return 0.0
        log_sum += area / total_area * math.log(axis_time)
    return math.exp(log_sum)


def rectangular_room(
    length_x_m: float, width_y_m: float, height_z_m: float, face_absorption: Mapping[str, float]
) -> Room:
    """直方体の部屋。face_absorption のキーは xMin, xMax, yMin, yMax, zMin, zMax。"""
    for value, label in (
        (length_x_m, "部屋の奥行（X）"),
        (width_y_m, "部屋の幅（Y）"),
        (height_z_m, "天井高（Z）"),
    ):
        require_positive_finite(value, NOT_POSITIVE_LENGTH, label)
    areas = {"x": width_y_m * height_z_m, "y": length_x_m * height_z_m, "z": length_x_m * width_y_m}
    surfaces = tuple(
        Surface(
            areas[axis], require_ratio(face_absorption[f"{axis}{side}"], f"{axis}{side}面"), axis
        )
        for axis in AXES
        for side in ("Min", "Max")
    )
    return Room(length_x_m * width_y_m * height_z_m, surfaces)
