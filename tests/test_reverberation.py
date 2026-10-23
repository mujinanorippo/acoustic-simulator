"""残響式（照合用 Python）の物理検証・意図的エラー・ランダム入力テスト。"""

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from tests.reference_py import reverberation as rev
from tests.reference_py.errors import (
    ABSORPTION_OUT_OF_RANGE,
    MISSING_AXIS,
    NO_ABSORPTION,
    NOT_POSITIVE_LENGTH,
    NOT_POSITIVE_PROPERTY,
    AcousticsInputError,
)

FACES = ("xMin", "xMax", "yMin", "yMax", "zMin", "zMax")


def uniform(alpha):
    return dict.fromkeys(FACES, alpha)


def six_tatami(faces):
    return rev.rectangular_room(3.64, 2.73, 2.4, faces)


# ---- 物理検証 ----


def test_sabine_coefficient_matches_literature_constant():
    # Prawda ほか SMC 2020 式(1) の定数 0.161 は 24·ln(10)/c を丸めた値
    assert rev.sabine_coefficient_s_per_m() == pytest.approx(0.161, rel=1e-3)


@pytest.mark.parametrize("alpha", [0.01, 0.1, 0.3, 0.6, 0.95])
def test_uniform_absorption_makes_fitzroy_and_arau_equal_eyring(alpha):
    # 吸音が一様なら Fitzroy 式(5)・Arau 式(6) は式の形から Eyring 式(2) と同じ値になる
    room = six_tatami(uniform(alpha))
    eyring = rev.eyring_s(room)
    assert rev.fitzroy_s(room) == pytest.approx(eyring, rel=1e-12)
    assert rev.arau_puchades_s(room) == pytest.approx(eyring, rel=1e-12)


def test_eyring_approaches_sabine_for_small_absorption():
    # −ln(1−α) ≈ α（α → 0）なので Eyring は Sabine に近づく
    room = six_tatami(uniform(1e-6))
    assert rev.eyring_s(room) / rev.sabine_s(room) == pytest.approx(1.0, rel=1e-6)


def test_sabine_hand_calculation():
    # 6畳 3.64×2.73×2.4 m、全面 α = 0.05 の手計算: T = 24·ln10/343.2 · V / (S·α)
    volume = 3.64 * 2.73 * 2.4
    area = 2 * (3.64 * 2.73 + 3.64 * 2.4 + 2.73 * 2.4)
    expected = 24 * math.log(10) / 343.2 * volume / (area * 0.05)
    assert rev.sabine_s(six_tatami(uniform(0.05))) == pytest.approx(expected, rel=1e-12)


def test_full_absorption_gives_zero_eyring():
    assert rev.eyring_s(six_tatami(uniform(1.0))) == 0.0
    assert rev.arau_puchades_s(six_tatami(uniform(1.0))) == 0.0
    assert rev.fitzroy_s(six_tatami(uniform(1.0))) == 0.0


# ---- ランダム入力（性質のテスト） ----

ratios = st.floats(min_value=0.01, max_value=0.99, allow_nan=False)
lengths = st.floats(min_value=0.3, max_value=30.0, allow_nan=False)


@given(lengths, lengths, lengths, st.lists(ratios, min_size=6, max_size=6))
def test_properties(length_x, width_y, height_z, alphas):
    room = rev.rectangular_room(length_x, width_y, height_z, dict(zip(FACES, alphas, strict=True)))
    sabine, eyring = rev.sabine_s(room), rev.eyring_s(room)
    fitzroy, arau = rev.fitzroy_s(room), rev.arau_puchades_s(room)
    assert 0 < eyring < sabine  # −ln(1−α) > α
    # Fitzroy は軸ごとの時間の算術平均、Arau は幾何平均（重み S_j/S）なので Fitzroy ≥ Arau
    assert fitzroy >= arau * (1 - 1e-12)
    assert all(math.isfinite(value) for value in (sabine, eyring, fitzroy, arau))


@given(lengths, lengths, lengths, ratios, st.floats(min_value=1.1, max_value=10.0))
def test_scaling_room_scales_time(length_x, width_y, height_z, alpha, scale):
    # 吸音率が同じなら T ∝ V/S なので、寸法を k 倍すると T も k 倍
    small = rev.rectangular_room(length_x, width_y, height_z, uniform(alpha))
    large = rev.rectangular_room(
        length_x * scale, width_y * scale, height_z * scale, uniform(alpha)
    )
    assert rev.eyring_s(large) == pytest.approx(rev.eyring_s(small) * scale, rel=1e-9)


# ---- 意図的エラー ----

BAD_LENGTHS = [0, -1.0, math.nan, math.inf, "3", None, True]


@pytest.mark.parametrize("bad", BAD_LENGTHS)
def test_bad_dimension_is_rejected(bad):
    with pytest.raises(AcousticsInputError) as error:
        rev.rectangular_room(bad, 2.0, 2.0, uniform(0.1))
    assert error.value.code == NOT_POSITIVE_LENGTH


@pytest.mark.parametrize("bad", [-0.01, 1.01, math.nan, math.inf, "0.5", None])
def test_bad_absorption_is_rejected(bad):
    faces = uniform(0.1) | {"zMin": bad}
    with pytest.raises(AcousticsInputError) as error:
        rev.rectangular_room(3.0, 3.0, 2.4, faces)
    assert error.value.code == ABSORPTION_OUT_OF_RANGE


def test_zero_absorption_is_rejected():
    room = six_tatami(uniform(0.0))
    for formula in (rev.sabine_s, rev.eyring_s, rev.fitzroy_s, rev.arau_puchades_s):
        with pytest.raises(AcousticsInputError) as error:
            formula(room)
        assert error.value.code == NO_ABSORPTION


def test_zero_absorption_on_one_axis_breaks_only_axis_formulas():
    faces = uniform(0.3) | {"xMin": 0.0, "xMax": 0.0}
    room = six_tatami(faces)
    assert rev.sabine_s(room) > 0
    with pytest.raises(AcousticsInputError) as error:
        rev.fitzroy_s(room)
    assert error.value.code == NO_ABSORPTION


def test_missing_axis_is_rejected():
    room = rev.Room(10.0, (rev.Surface(10.0, 0.2, "x"), rev.Surface(10.0, 0.2, "y")))
    assert rev.sabine_s(room) > 0
    with pytest.raises(AcousticsInputError) as error:
        rev.arau_puchades_s(room)
    assert error.value.code == MISSING_AXIS


@pytest.mark.parametrize("bad", [0, -343.0, math.nan])
def test_bad_speed_of_sound_is_rejected(bad):
    with pytest.raises(AcousticsInputError) as error:
        rev.sabine_s(six_tatami(uniform(0.2)), bad)
    assert error.value.code == NOT_POSITIVE_PROPERTY


def test_room_without_surfaces_is_rejected():
    with pytest.raises(AcousticsInputError) as error:
        rev.sabine_s(rev.Room(10.0, ()))
    assert error.value.code == NOT_POSITIVE_LENGTH
