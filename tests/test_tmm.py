"""伝達マトリクス法（照合用 Python）の物理検証・意図的エラー・ランダム入力テスト。"""

import json
import math
from pathlib import Path

import numpy as np
import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from tests.reference_py import tmm
from tests.reference_py.errors import (
    ABSORPTION_OUT_OF_RANGE,
    INVALID_ANGLE,
    NOT_POSITIVE_FREQUENCY,
    NOT_POSITIVE_LENGTH,
    NOT_POSITIVE_PROPERTY,
    OUT_OF_NUMERIC_RANGE,
    UNKNOWN_LAYER,
    AcousticsInputError,
)

CROSSCHECK = Path(__file__).resolve().parent / "data" / "crosscheck"


def mass_law_normal_db(mass, frequency):
    return 10 * math.log10(1 + (2 * math.pi * frequency * mass / (2 * tmm.Z_AIR)) ** 2)


@pytest.mark.parametrize("frequency", [63, 250, 1000, 4000])
def test_limp_mass_matches_exact_mass_law(frequency):
    tau = tmm.transmission_coefficient([tmm.Plate(10, 0, 0)], frequency)
    assert tmm.transmission_loss_db(tau) == pytest.approx(
        mass_law_normal_db(10, frequency), abs=1e-9
    )


@pytest.mark.parametrize("frequency", [500, 1000, 2000])
def test_field_incidence_is_about_5_5_db_below_normal(frequency):
    layers = [tmm.Plate(10, 0, 0)]
    normal = tmm.transmission_loss_db(tmm.transmission_coefficient(layers, frequency))
    field = tmm.transmission_loss_db(tmm.diffuse_transmission_coefficient(layers, frequency))
    assert normal - field == pytest.approx(5.5, abs=0.5)


def test_lossless_plate_transmits_fully_at_coincidence_angle():
    stiffness = tmm.bending_stiffness_nm(2.5e9, 0.3, 0.0125)
    critical = tmm.critical_frequency_hz(10, stiffness)
    angle = math.asin(math.sqrt(0.5))
    tau = tmm.transmission_coefficient([tmm.Plate(10, stiffness, 0)], 2 * critical, angle)
    assert tau == pytest.approx(1, abs=1e-9)


def test_double_wall_peak_is_mass_air_mass_resonance():
    layers = [tmm.Plate(20, 0, 0), tmm.Air(0.05), tmm.Plate(10, 0, 0)]
    frequencies = np.arange(20, 400, 0.05)
    taus = [tmm.transmission_coefficient(layers, float(f)) for f in frequencies]
    peak = frequencies[int(np.argmax(taus))]
    assert peak / tmm.mass_air_mass_resonance_hz(20, 10, 0.05) == pytest.approx(1, abs=0.05)


def test_air_layer_is_transparent_and_non_absorbing():
    assert tmm.transmission_coefficient([tmm.Air(0.1)], 500, 0.3) == pytest.approx(1, abs=1e-12)
    assert tmm.normal_absorption_rigid_backed([tmm.Air(0.1)], 500) == pytest.approx(0, abs=1e-12)
    assert tmm.normal_absorption_rigid_backed([tmm.Plate(10, 0, 0)], 500) == 0


def test_hagen_poiseuille_limit_of_perforation():
    # 穴が粘性境界層より十分細い（s → 0）とき、穴の抵抗は Hagen-Poiseuille の 32ηt/d² に近づく
    layer = tmm.Perforated(1e-3, 1e-5, 1.0)
    impedance = tmm.perforated_impedance(1.0, layer)
    end_resistance = math.sqrt(2 * tmm.air_viscosity_pas() * 2 * math.pi * tmm.RHO) / 2
    poiseuille = 32 * tmm.air_viscosity_pas() * layer.thickness_m / layer.hole_diameter_m**2
    assert impedance.real - end_resistance == pytest.approx(poiseuille, rel=1e-6)


def test_bessel_integral_matches_series():
    for size in (0.5, 3.0, 8.0):
        z = size * complex(math.sqrt(0.5), -math.sqrt(0.5))
        series = sum((-1) ** k * (z / 2) ** (2 * k) / math.factorial(k) ** 2 for k in range(80))
        assert abs(tmm.bessel_j(0, z) - series) / abs(series) < 1e-12


def test_point_values_match_expected_file():
    """点ごとの値（積分なし）の回帰テスト。積分を含む値は CI の --check で確かめる。"""
    cases = json.loads((CROSSCHECK / "tmm.cases.json").read_text(encoding="utf-8"))
    expected = json.loads((CROSSCHECK / "tmm.expected.json").read_text(encoding="utf-8"))
    oblique = math.radians(cases["obliqueAngleDeg"])
    import generate_crosscheck

    for case, result in zip(cases["cases"], expected["results"], strict=True):
        layers = [generate_crosscheck._layer(item) for item in case["layers"]]
        for frequency, point in zip(case["frequenciesHz"], result["points"], strict=True):
            if case["transmission"]:
                tau = tmm.transmission_coefficient(layers, frequency)
                assert tau == pytest.approx(point["tauNormal"], rel=1e-9)
                tau = tmm.transmission_coefficient(layers, frequency, oblique)
                assert tau == pytest.approx(point["tauOblique"], rel=1e-9)
            if case["absorption"]:
                alpha = tmm.normal_absorption_rigid_backed(layers, frequency)
                assert alpha == pytest.approx(point["absorptionNormal"], rel=1e-9)


layer_strategy = st.one_of(
    st.builds(
        tmm.Plate,
        st.floats(0.5, 100),
        st.floats(0, 1e5),
        st.floats(0, 0.5),
    ),
    st.builds(tmm.Air, st.floats(0.001, 0.3)),
    st.builds(tmm.Porous, st.floats(0.005, 0.2), st.floats(1000, 100000)),
)


def _in_range(layers, frequency):
    return all(
        tmm.is_miki_in_valid_range(frequency, layer.flow_resistivity_pasm2)
        for layer in layers
        if isinstance(layer, tmm.Porous)
    )


@settings(max_examples=200)
@given(st.lists(layer_strategy, min_size=1, max_size=4), st.floats(50, 5000), st.floats(0, 1.5))
def test_passivity(layers, frequency, angle):
    # Miki モデルの適用範囲（0.01 ≤ f/σ ≤ 1）の外では受動性が保証されない（下のテスト）
    assume(_in_range(layers, frequency))
    tau = tmm.transmission_coefficient(layers, frequency, angle)
    assert 0 <= tau <= 1 + 1e-9
    alpha = tmm.normal_absorption_rigid_backed(layers, frequency)
    assert -1e-9 <= alpha <= 1 + 1e-9


def test_miki_out_of_range_is_slightly_non_passive():
    # Kirby (2014) の指摘どおり、f/σ ≪ 0.01 では Miki モデルが物理的でない値を出す。
    # 吸音率がわずかに負になる例。値は小さい（−1e-3 より大きい）ことも確かめる
    layers = [tmm.Porous(0.005, 100000)]
    assert not tmm.is_miki_in_valid_range(50, 100000)
    alpha = tmm.normal_absorption_rigid_backed(layers, 50)
    assert -1e-3 < alpha < 0


def _code(action):
    with pytest.raises(AcousticsInputError) as error:
        action()
    return error.value.code


def test_errors():
    assert _code(lambda: tmm.transmission_coefficient([], 500)) == UNKNOWN_LAYER
    assert _code(lambda: tmm.transmission_coefficient(["concrete"], 500)) == UNKNOWN_LAYER
    assert _code(lambda: tmm.transmission_coefficient([tmm.Air(0)], 500)) == NOT_POSITIVE_LENGTH
    assert _code(lambda: tmm.transmission_coefficient([tmm.Plate(0, 0, 0)], 500)) == (
        NOT_POSITIVE_PROPERTY
    )
    assert _code(lambda: tmm.transmission_coefficient([tmm.Plate(10, -1, 0)], 500)) == (
        NOT_POSITIVE_PROPERTY
    )
    assert _code(lambda: tmm.transmission_coefficient([tmm.Plate(10, 0, 1.5)], 500)) == (
        ABSORPTION_OUT_OF_RANGE
    )
    assert _code(lambda: tmm.transmission_coefficient([tmm.Perforated(0.005, 0.005, 0)], 500)) == (
        ABSORPTION_OUT_OF_RANGE
    )
    assert _code(lambda: tmm.transmission_coefficient([tmm.Plate(10, 0, 0)], 0)) == (
        NOT_POSITIVE_FREQUENCY
    )
    assert _code(lambda: tmm.transmission_coefficient([tmm.Plate(10, 0, 0)], 500, 2.0)) == (
        INVALID_ANGLE
    )
    assert _code(lambda: tmm.transmission_coefficient([tmm.Porous(1000, 100000)], 5000)) == (
        OUT_OF_NUMERIC_RANGE
    )
