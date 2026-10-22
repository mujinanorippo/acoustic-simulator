"""二重実装照合の期待値を作る（開発設計書「テスト計画：二重実装照合」）。

tests/data/crosscheck/*.cases.json の入力を照合用 Python（tests/reference_py）で計算し、
*.expected.json に書く。ブラウザ側のテストはこの期待値と自分の結果を比べる。

  python tools/generate_crosscheck.py          期待値を書き出す
  python tools/generate_crosscheck.py --check  書き出し済みの期待値が今の結果と一致するか確かめる
"""

from __future__ import annotations

import json
import math
import sys
from collections.abc import Callable
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from tests.reference_py import frequency_bands, reverberation  # noqa: E402

CROSSCHECK_DIR = REPO_ROOT / "tests" / "data" / "crosscheck"
# 照合用 Python 自身の再計算との一致の許容差（同じ実装なので丸め誤差のみ）
SELF_RELATIVE_TOLERANCE = 1e-12


def reverberation_expected(case: dict) -> dict:
    room_input = case["room"]
    room = reverberation.rectangular_room(
        room_input["lengthXM"],
        room_input["widthYM"],
        room_input["heightZM"],
        case["faceAbsorption"],
    )
    return {
        "id": case["id"],
        "sabineS": reverberation.sabine_s(room),
        "eyringS": reverberation.eyring_s(room),
        "fitzroyS": reverberation.fitzroy_s(room),
        "arauPuchadesS": reverberation.arau_puchades_s(room),
    }


def frequency_bands_expected(case: dict) -> dict:
    lower_hz, upper_hz = frequency_bands.band_edges_hz(case["bandIndex"])
    return {
        "id": case["id"],
        "centerHz": frequency_bands.exact_center_frequency_hz(case["bandIndex"]),
        "lowerHz": lower_hz,
        "upperHz": upper_hz,
    }


GENERATORS: dict[str, Callable[[dict], dict]] = {
    "reverberation": reverberation_expected,
    "frequency-bands": frequency_bands_expected,
}


def compute(name: str) -> dict:
    cases = json.loads((CROSSCHECK_DIR / f"{name}.cases.json").read_text(encoding="utf-8"))
    return {
        "generatedBy": "tools/generate_crosscheck.py（照合用 Python）",
        "results": [GENERATORS[name](case) for case in cases["cases"]],
    }


def _same(left: object, right: object) -> bool:
    if isinstance(left, float) and isinstance(right, int | float):
        return math.isclose(left, right, rel_tol=SELF_RELATIVE_TOLERANCE, abs_tol=0.0)
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(_same(left[key], right[key]) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(map(_same, left, right))
    return left == right


def check(name: str) -> list[str]:
    path = CROSSCHECK_DIR / f"{name}.expected.json"
    if not path.exists():
        return [f"{path.name} がない（generate_crosscheck.py で作る）"]
    stored = json.loads(path.read_text(encoding="utf-8"))
    if not _same(compute(name), stored):
        return [f"{path.name} が照合用 Python の今の結果と合わない（作り直しが必要）"]
    return []


def main(argv: list[str]) -> int:
    if "--check" in argv:
        problems = [problem for name in GENERATORS for problem in check(name)]
        for problem in problems:
            print(problem)
        print(f"照合用期待値 {len(GENERATORS)} 組、問題 {len(problems)} 件")
        return 1 if problems else 0
    for name in GENERATORS:
        text = json.dumps(compute(name), ensure_ascii=False, indent=2) + "\n"
        (CROSSCHECK_DIR / f"{name}.expected.json").write_text(text, encoding="utf-8")
        print(f"{name}.expected.json を書き出した")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
