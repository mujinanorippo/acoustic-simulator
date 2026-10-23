"""帯域表（照合用 Python）の検証。"""

import pytest

from tests.reference_py import constants as const
from tests.reference_py import frequency_bands as fb
from tests.reference_py.errors import BAND_OUT_OF_RANGE, AcousticsInputError


def test_band_count_and_rating_range():
    indices = fb.band_indices()
    assert len(indices) == len(const.NOMINAL_CENTER_FREQUENCIES_HZ) == 21
    rating = [x for x in indices if const.RATING_BAND_INDEX_MIN <= x <= const.RATING_BAND_INDEX_MAX]
    assert len(rating) == 16  # Rw は 100〜3150 Hz の16帯域


def test_reference_band_is_1000_hz():
    assert fb.exact_center_frequency_hz(0) == pytest.approx(1000.0, rel=1e-15)


def test_exact_centers_are_close_to_nominal():
    # 呼び周波数は正確な値を丸めた推奨値。差は最大でも 1% 未満（最大は 1600 Hz 帯の 0.94%）
    for x, nominal in zip(fb.band_indices(), const.NOMINAL_CENTER_FREQUENCIES_HZ, strict=True):
        assert fb.exact_center_frequency_hz(x) == pytest.approx(nominal, rel=0.01)


def test_bands_are_contiguous_and_one_third_octave():
    for x in fb.band_indices()[:-1]:
        _, upper = fb.band_edges_hz(x)
        lower_next, _ = fb.band_edges_hz(x + 1)
        assert upper == pytest.approx(lower_next, rel=1e-12)
        ratio = fb.exact_center_frequency_hz(x + 1) / fb.exact_center_frequency_hz(x)
        assert ratio == pytest.approx(10**0.1, rel=1e-12)


@pytest.mark.parametrize("bad", [-14, 8, 0.5, "0", None, True])
def test_out_of_range_band_is_rejected(bad):
    with pytest.raises(AcousticsInputError) as error:
        fb.exact_center_frequency_hz(bad)
    assert error.value.code == BAND_OUT_OF_RANGE
