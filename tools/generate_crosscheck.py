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

from tests.reference_py import frequency_bands, openings, reverberation, tmm  # noqa: E402

CROSSCHECK_DIR = REPO_ROOT / "tests" / "data" / "crosscheck"
# 照合用 Python 自身の再計算との一致の許容差。同じ実装でも CPU や数学ライブラリの違いで
# 最後の桁が変わり、桁落ちのある計算では相対 1e-12 程度まで広がりうるため、ブラウザ側との
# 照合と同じ 1e-9 にする
SELF_RELATIVE_TOLERANCE = 1e-9


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


def _layer(data: dict) -> tmm.Layer:
    kind = data["kind"]
    if kind == "air":
        return tmm.Air(data["thicknessM"])
    if kind == "porous":
        return tmm.Porous(data["thicknessM"], data["flowResistivityPasm2"])
    if kind == "plate":
        return tmm.Plate(
            data["surfaceDensityKgm2"], data["bendingStiffnessNm"], data["lossFactorRatio"]
        )
    return tmm.Perforated(data["thicknessM"], data["holeDiameterM"], data["perforationRatio"])


# 帯域透過損失を照合する帯域（100 Hz、1000 Hz、3150 Hz）
TMM_BAND_INDICES = (-10, 0, 5)


def tmm_expected(case: dict, oblique_deg: float) -> dict:
    layers = [_layer(item) for item in case["layers"]]
    oblique = math.radians(oblique_deg)
    points = []
    for frequency in case["frequenciesHz"]:
        point: dict = {"frequencyHz": frequency}
        if case["transmission"]:
            point["tauNormal"] = tmm.transmission_coefficient(layers, frequency)
            point["tauOblique"] = tmm.transmission_coefficient(layers, frequency, oblique)
            diffuse = tmm.diffuse_transmission_coefficient(layers, frequency)
            point["diffuseTlDb"] = tmm.transmission_loss_db(diffuse)
        if case["absorption"]:
            point["absorptionNormal"] = tmm.normal_absorption_rigid_backed(layers, frequency)
        points.append(point)
    result: dict = {"id": case["id"], "points": points}
    if case["transmission"]:
        result["bandTlDb"] = [
            tmm.band_transmission_loss_db(layers, *frequency_bands.band_edges_hz(index))
            for index in TMM_BAND_INDICES
        ]
    return result


def openings_expected(case: dict) -> dict:
    return {"id": case["id"]} | openings.opening_reduction(case["wallTlDb"], case["openingRatio"])


GENERATORS: dict[str, Callable[[dict], dict]] = {
    "openings": openings_expected,
    "reverberation": reverberation_expected,
    "frequency-bands": frequency_bands_expected,
    "tmm": tmm_expected,
}


def compute(name: str) -> dict:
    cases = json.loads((CROSSCHECK_DIR / f"{name}.cases.json").read_text(encoding="utf-8"))
    generator = GENERATORS[name]
    if name == "tmm":
        results = [generator(case, cases["obliqueAngleDeg"]) for case in cases["cases"]]
    else:
        results = [generator(case) for case in cases["cases"]]
    return {"generatedBy": "tools/generate_crosscheck.py（照合用 Python）", "results": results}


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
