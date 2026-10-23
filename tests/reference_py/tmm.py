"""伝達マトリクス法（照合用 Python）。ブラウザ側 tmm.js とは別の数値手法で同じ式を計算する。

時間因子 e^{jωt}。出典は tmm.js・layer-models.js と同じ:
  Tageman, Chalmers 修士論文 2013:108 式(16)(21)(22)(33)(52)(53)
  Miki: Matelys APMR「Delany-Bazley-Miki model」
  有孔板: Cobo, Acoustics 3(4) 2021 式(6)(8)(9)(10)、Jaouen & Chevillotte, Acta Acust. 2018
  ベッセル関数: J_n(z) = (1/π)∫_0^π cos(n·t − z·sin t) dt（n は整数、z は複素数）
    Fungrim 99c077 https://fungrim.org/entry/99c077.html

ブラウザ側との違い（独立性のため、わざと変えている所）:
  - J1/J0 は漸化式ではなく積分表示を台形則で計算する
  - 拡散入射の角度積分は共鳴探しをせず、非常に細かい等間隔の台形則（力まかせ）
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from . import constants as const
from .errors import (
    ABSORPTION_OUT_OF_RANGE,
    INVALID_ANGLE,
    NOT_POSITIVE_FREQUENCY,
    NOT_POSITIVE_LENGTH,
    NOT_POSITIVE_PROPERTY,
    OUT_OF_NUMERIC_RANGE,
    UNKNOWN_LAYER,
    AcousticsInputError,
    require_positive_finite,
    require_ratio,
)

RHO = const.AIR_DENSITY_KGM3
C0 = const.AIR_SPEED_OF_SOUND_MPS
Z_AIR = RHO * C0

# 数値積分の設定（物理量ではない）
BESSEL_NODES_MARGIN = 64  # 台形則の点数 = 2|z| + 余裕
# 拡散入射の積分の区間数。二重壁の鋭い共鳴（幅 ~1e-5）も取りこぼさない細かさ。
# 2^19 と 2^20 の差が 0.003 dB 以下になることを確認して決めた
ANGLE_INTERVALS = 2**20
BAND_SAMPLES = 16  # 帯域内の周波数点数（ブラウザ側と同じ定義で比べるため同数）

# Delany-Bazley の元データの範囲 0.01 < f/σ < 1（Matelys APMR）。範囲外は参考値
MIKI_VALID_RANGE = (0.01, 1.0)

# Miki（X = 10³·f/σ）
MIKI_SCALE = 1e3
MIKI_Z = (5.5, 8.43, -0.632)
MIKI_K = (7.81, 11.41, -0.618)

# 有孔板
END_CORRECTION_PER_DIAMETER = 0.85
INTERACTION = (1.33, 0.07, 0.40)
BENDING_DIVISOR = 12.0


@dataclass(frozen=True)
class Air:
    thickness_m: float


@dataclass(frozen=True)
class Porous:
    thickness_m: float
    flow_resistivity_pasm2: float


@dataclass(frozen=True)
class Plate:
    surface_density_kgm2: float
    bending_stiffness_nm: float
    loss_factor_ratio: float


@dataclass(frozen=True)
class Perforated:
    thickness_m: float
    hole_diameter_m: float
    perforation_ratio: float


Layer = Air | Porous | Plate | Perforated


def air_viscosity_pas(temperature_k: float = const.AIR_TEMPERATURE_K) -> float:
    reference = const.SUTHERLAND_REFERENCE_TEMPERATURE_K
    constant = const.SUTHERLAND_CONSTANT_K
    return (
        const.SUTHERLAND_REFERENCE_VISCOSITY_PAS
        * (temperature_k / reference) ** 1.5
        * (reference + constant)
        / (temperature_k + constant)
    )


def bending_stiffness_nm(
    youngs_modulus_pa: float, poisson_ratio: float, thickness_m: float
) -> float:
    return youngs_modulus_pa * thickness_m**3 / (BENDING_DIVISOR * (1 - poisson_ratio**2))


def bending_stiffness_from_coincidence_nm(
    surface_density_kgm2: float, coincidence_product_mps: float, thickness_m: float
) -> float:
    """fc·h から曲げ剛性：B = c⁴·m / (4π²·fc²)、fc = fc·h / h（Crispin & Mertens 式(3)）"""
    if coincidence_product_mps == 0:
        return 0.0
    critical = coincidence_product_mps / thickness_m
    return C0**4 * surface_density_kgm2 / (2 * math.pi * critical) ** 2


def critical_frequency_hz(surface_density_kgm2: float, bending_stiffness: float) -> float:
    return C0**2 / (2 * math.pi) * math.sqrt(surface_density_kgm2 / bending_stiffness)


def mass_air_mass_resonance_hz(mass1_kgm2: float, mass2_kgm2: float, gap_m: float) -> float:
    return math.sqrt(RHO * C0**2 / gap_m * (1 / mass1_kgm2 + 1 / mass2_kgm2)) / (2 * math.pi)


def bessel_j(order: int, argument: complex) -> complex:
    """J_n(z) = (1/2π)∫_0^{2π} cos(n·t − z·sin t) dt を台形則で（周期関数なので指数的に収束）"""
    nodes = 2 * math.ceil(abs(argument)) + 2 * order + BESSEL_NODES_MARGIN
    angles = np.arange(nodes) * (2 * math.pi / nodes)
    return complex(np.mean(np.cos(order * angles - argument * np.sin(angles))))


def is_miki_in_valid_range(frequency_hz: float, flow_resistivity: float) -> bool:
    low, high = MIKI_VALID_RANGE
    return low <= frequency_hz / flow_resistivity <= high


def miki(frequency_hz: float, flow_resistivity: float) -> tuple[complex, complex]:
    scaled = MIKI_SCALE * frequency_hz / flow_resistivity
    zr, zi, ze = MIKI_Z
    kr, ki, ke = MIKI_K
    impedance = Z_AIR * (1 + zr * scaled**ze - 1j * zi * scaled**ze)
    wavenumber = 2 * math.pi * frequency_hz / C0 * (1 + kr * scaled**ke - 1j * ki * scaled**ke)
    return impedance, wavenumber


def perforated_impedance(frequency_hz: float, layer: Perforated) -> complex:
    omega = 2 * math.pi * frequency_hz
    viscosity = air_viscosity_pas()
    phi = layer.perforation_ratio
    s = layer.hole_diameter_m * math.sqrt(RHO * omega / (4 * viscosity))
    z = s * complex(math.cos(-math.pi / 4), math.sin(-math.pi / 4))  # s·√(−j)
    ratio = bessel_j(1, z) / bessel_j(0, z)
    hole = 1j * omega * RHO * layer.thickness_m / (1 - 2 / z * ratio)
    a, b, c = INTERACTION
    interaction = 1 - a * math.sqrt(phi) - b * phi + c * phi**1.5
    end = math.sqrt(2 * viscosity * omega * RHO) / 2 + 1j * omega * RHO * (
        END_CORRECTION_PER_DIAMETER * layer.hole_diameter_m * interaction
    )
    return (hole + end) / phi


def _check(layers: Sequence[Layer]) -> None:
    if not layers:
        raise AcousticsInputError(UNKNOWN_LAYER, "層が1つもありません")
    for number, layer in enumerate(layers, start=1):
        label = f"{number}層目"
        if isinstance(layer, Air):
            require_positive_finite(layer.thickness_m, NOT_POSITIVE_LENGTH, label)
        elif isinstance(layer, Porous):
            require_positive_finite(layer.thickness_m, NOT_POSITIVE_LENGTH, label)
            require_positive_finite(layer.flow_resistivity_pasm2, NOT_POSITIVE_PROPERTY, label)
        elif isinstance(layer, Plate):
            require_positive_finite(layer.surface_density_kgm2, NOT_POSITIVE_PROPERTY, label)
            if not (math.isfinite(layer.bending_stiffness_nm) and layer.bending_stiffness_nm >= 0):
                raise AcousticsInputError(NOT_POSITIVE_PROPERTY, f"{label}の曲げ剛性")
            require_ratio(layer.loss_factor_ratio, label)
        elif isinstance(layer, Perforated):
            require_positive_finite(layer.thickness_m, NOT_POSITIVE_LENGTH, label)
            require_positive_finite(layer.hole_diameter_m, NOT_POSITIVE_LENGTH, label)
            require_ratio(layer.perforation_ratio, label)
            require_positive_finite(layer.perforation_ratio, ABSORPTION_OUT_OF_RANGE, label)
        else:
            raise AcousticsInputError(UNKNOWN_LAYER, f"{label}の種類が使えない")


def _fluid(impedance: complex, wavenumber: complex, thickness: float, kt: np.ndarray) -> np.ndarray:
    kz = np.sqrt(wavenumber**2 - kt**2 + 0j)
    kz = np.where(kz.imag > 0, -kz, kz)
    z_eff = impedance * wavenumber / kz
    cos_, sin_ = np.cos(kz * thickness), np.sin(kz * thickness)
    return np.array([[cos_, 1j * z_eff * sin_], [1j * sin_ / z_eff, cos_]])


def _series(impedance: np.ndarray) -> np.ndarray:
    one, zero = np.ones_like(impedance), np.zeros_like(impedance)
    return np.array([[one, impedance], [zero, one]])


def _layer(layer: Layer, frequency_hz: float, kt: np.ndarray) -> np.ndarray:
    omega = 2 * math.pi * frequency_hz
    if isinstance(layer, Air):
        return _fluid(complex(Z_AIR), complex(omega / C0), layer.thickness_m, kt)
    if isinstance(layer, Porous):
        impedance, wavenumber = miki(frequency_hz, layer.flow_resistivity_pasm2)
        return _fluid(impedance, wavenumber, layer.thickness_m, kt)
    if isinstance(layer, Plate):
        stiffness = layer.bending_stiffness_nm * (1 + 1j * layer.loss_factor_ratio)
        return _series(1j * omega * layer.surface_density_kgm2 + stiffness * kt**4 / (1j * omega))
    return _series(np.full(kt.shape, perforated_impedance(frequency_hz, layer)))


def _tau(layers: Sequence[Layer], frequency_hz: float, angles_rad: np.ndarray) -> np.ndarray:
    # 桁あふれは結果が有限かどうかで判定してエラーにするので、途中の警告は出さない
    with np.errstate(over="ignore", invalid="ignore"):
        return _tau_unchecked(layers, frequency_hz, angles_rad)


def _tau_unchecked(layers: Sequence[Layer], frequency_hz: float, angles_rad: np.ndarray):
    kt = (2 * math.pi * frequency_hz / C0) * np.sin(angles_rad).astype(complex)
    total = None
    for layer in layers:
        matrix = _layer(layer, frequency_hz, kt)
        total = matrix if total is None else np.einsum("ij...,jk...->ik...", total, matrix)
    z0 = Z_AIR / np.cos(angles_rad)
    tau = 4 / np.abs(total[0, 0] + total[0, 1] / z0 + z0 * total[1, 0] + total[1, 1]) ** 2
    if not np.all(np.isfinite(tau)):
        raise AcousticsInputError(OUT_OF_NUMERIC_RANGE, "数値が計算範囲を超えた")
    return tau


def transmission_coefficient(layers: Sequence[Layer], frequency_hz: float, angle_rad: float = 0.0):
    _check(layers)
    require_positive_finite(frequency_hz, NOT_POSITIVE_FREQUENCY, "周波数")
    if not 0 <= angle_rad < math.pi / 2:
        raise AcousticsInputError(INVALID_ANGLE, "入射角は 0 以上 π/2 未満")
    return float(_tau(layers, frequency_hz, np.array([angle_rad]))[0])


def diffuse_transmission_coefficient(
    layers: Sequence[Layer], frequency_hz: float, limit_deg: float = const.FIELD_INCIDENCE_LIMIT_DEG
) -> float:
    """u = sin²θ に変数変換し、2^20 区間の台形則で (1/u_lim)∫τ du を計算する（力まかせ）。"""
    _check(layers)
    require_positive_finite(frequency_hz, NOT_POSITIVE_FREQUENCY, "周波数")
    upper = math.sin(math.radians(limit_deg)) ** 2
    u = np.linspace(0.0, upper, ANGLE_INTERVALS + 1)
    tau = _tau(layers, frequency_hz, np.arcsin(np.sqrt(u)))
    return float(np.trapezoid(tau, u) / upper)


def transmission_loss_db(tau: float) -> float:
    return -10 * math.log10(tau)


def band_transmission_loss_db(
    layers: Sequence[Layer], lower_hz: float, upper_hz: float, limit_deg: float | None = None
) -> float:
    limit = const.FIELD_INCIDENCE_LIMIT_DEG if limit_deg is None else limit_deg
    positions = (np.arange(BAND_SAMPLES) + 0.5) / BAND_SAMPLES
    frequencies = lower_hz * (upper_hz / lower_hz) ** positions
    taus = [diffuse_transmission_coefficient(layers, float(f), limit) for f in frequencies]
    return transmission_loss_db(float(np.mean(taus)))


def normal_absorption_rigid_backed(layers: Sequence[Layer], frequency_hz: float) -> float:
    _check(layers)
    require_positive_finite(frequency_hz, NOT_POSITIVE_FREQUENCY, "周波数")
    kt = np.zeros(1, dtype=complex)
    total = None
    for layer in layers:
        matrix = _layer(layer, frequency_hz, kt)
        total = matrix if total is None else np.einsum("ij...,jk...->ik...", total, matrix)
    front, loaded = total[0, 0, 0], Z_AIR * total[1, 0, 0]
    # 1 − |R|² = 4·Re(A·conj(B))/|A + B|²（桁落ちを避ける形）
    return float(4 * (front * loaded.conjugate()).real / abs(front + loaded) ** 2)
