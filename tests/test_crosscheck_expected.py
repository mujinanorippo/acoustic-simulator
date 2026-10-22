"""二重実装照合の期待値ファイルが、照合用 Python の今の結果と一致しているか（回帰テスト）。"""

import generate_crosscheck


def test_expected_files_are_up_to_date():
    problems = [
        problem
        for name in generate_crosscheck.GENERATORS
        for problem in generate_crosscheck.check(name)
    ]
    assert problems == []
