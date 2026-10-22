"""開口部による遮音低下（照合用 Python）の検証。"""

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from tests.reference_py import openings
from tests.reference_py.errors import (
    ABSORPTION_OUT_OF_RANGE,
    NOT_POSITIVE_LENGTH,
    NOT_POSITIVE_PROPERTY,
    AcousticsInputError,
)


def test_one_percent_opening_limits_insulation_to_about_20_db():
    # τ̄ ≈ 0.01 なので、どれだけ良い壁でも合成透過損失は約 20 dB で頭打ち（10·log10(1/0.01)）
    result = openings.opening_reduction(65, 0.01)
    assert result["compositeTlDb"] == pytest.approx(20.0, abs=0.01)


def test_no_opening_keeps_wall_and_full_opening_gives_zero():
    assert openings.opening_reduction(40, 0)["reductionDb"] == pytest.approx(0, abs=1e-12)
    assert openings.opening_reduction(40, 1)["compositeTlDb"] == pytest.approx(0, abs=1e-12)


def test_composite_of_equal_parts_is_unchanged():
    assert openings.composite_transmission_loss_db([(2, 30), (3, 30)]) == pytest.approx(30)


@given(st.floats(0, 80), st.floats(0, 1))
def test_reduction_properties(wall, ratio):
    result = openings.opening_reduction(wall, ratio)
    assert 0 <= result["compositeTlDb"] <= wall + 1e-9
    assert result["reductionDb"] >= -1e-9
    assert result["transmittedEnergyFactor"] >= 1 - 1e-9


@pytest.mark.parametrize("bad", [-0.1, 1.1, math.nan, "0.1", None])
def test_bad_ratio(bad):
    with pytest.raises(AcousticsInputError) as error:
        openings.opening_reduction(40, bad)
    assert error.value.code == ABSORPTION_OUT_OF_RANGE


def test_bad_inputs():
    with pytest.raises(AcousticsInputError) as error:
        openings.opening_reduction(math.inf, 0.1)
    assert error.value.code == NOT_POSITIVE_PROPERTY
    with pytest.raises(AcousticsInputError) as error:
        openings.composite_transmission_loss_db([])
    assert error.value.code == NOT_POSITIVE_LENGTH
    with pytest.raises(AcousticsInputError) as error:
        openings.composite_transmission_loss_db([(0, 30)])
    assert error.value.code == NOT_POSITIVE_LENGTH
