"""二重実装照合の期待値ファイルが、照合用 Python の今の結果と一致しているか（回帰テスト）。

tmm は全部計算し直すと2分ほどかかるため、ここでは点ごとの値だけを tests/test_tmm.py で確かめ、
全部の照合は CI の `python tools/generate_crosscheck.py --check` で行う。
"""

import generate_crosscheck
import pytest


@pytest.mark.parametrize("name", ["reverberation", "frequency-bands"])
def test_expected_files_are_up_to_date(name):
    assert generate_crosscheck.check(name) == []
