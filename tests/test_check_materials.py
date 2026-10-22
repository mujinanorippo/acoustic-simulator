"""材料データチェックが、出典の欠けたデータを確実に不合格にすることを確かめる（意図的エラー）。"""

import copy
import json
from pathlib import Path

import pytest
from check_materials import CONSTANT_SCHEMA, check_directory

VALID_MATERIAL = {
    "schemaVersion": 1,
    "id": "sample-board",
    "name": "検査用サンプル板",
    "properties": {
        "surfaceDensity": {
            "value": 1.0,
            "unit": "kg/m2",
            "source": {
                "title": "検査用ダミー出典",
                "url": "https://example.com/",
                "accessed": "2026-10-22",
            },
            "reliability": "暫定",
        }
    },
}


def write_material(directory: Path, data: object, name: str = "sample-board") -> None:
    (directory / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), "utf-8")


def broken(mutate) -> dict:
    data = copy.deepcopy(VALID_MATERIAL)
    mutate(data)
    return data


def test_valid_material_passes(tmp_path):
    write_material(tmp_path, VALID_MATERIAL)
    assert check_directory(tmp_path) == []


def test_empty_directory_passes(tmp_path):
    assert check_directory(tmp_path) == []


def test_repository_materials_pass():
    assert check_directory(Path(__file__).resolve().parent.parent / "shared" / "materials") == []


BROKEN_CASES = {
    "出典なし": lambda d: d["properties"]["surfaceDensity"].pop("source"),
    "URLなし": lambda d: d["properties"]["surfaceDensity"]["source"].pop("url"),
    "確認日なし": lambda d: d["properties"]["surfaceDensity"]["source"].pop("accessed"),
    "確認日の形式違い": lambda d: d["properties"]["surfaceDensity"]["source"].update(
        accessed="2026年10月22日"
    ),
    "httpのURL": lambda d: d["properties"]["surfaceDensity"]["source"].update(
        url="http://example.com/"
    ),
    "信頼度なし": lambda d: d["properties"]["surfaceDensity"].pop("reliability"),
    "未定義の信頼度": lambda d: d["properties"]["surfaceDensity"].update(reliability="たぶん"),
    "単位なし": lambda d: d["properties"]["surfaceDensity"].pop("unit"),
    "数値が文字列": lambda d: d["properties"]["surfaceDensity"].update(value="1.0"),
    "値が空配列": lambda d: d["properties"]["surfaceDensity"].update(value=[]),
    "物性が空": lambda d: d.update(properties={}),
    "形式版の違い": lambda d: d.update(schemaVersion=2),
    "未定義の項目": lambda d: d.update(memo="x"),
}


@pytest.mark.parametrize("case", sorted(BROKEN_CASES))
def test_broken_material_fails(tmp_path, case):
    write_material(tmp_path, broken(BROKEN_CASES[case]))
    assert check_directory(tmp_path) != []


def test_id_mismatch_fails(tmp_path):
    write_material(tmp_path, VALID_MATERIAL, name="other-name")
    assert check_directory(tmp_path) != []


@pytest.mark.parametrize("content", ["", "{", "[1, 2]", "null", "\xff\xfe"])
def test_unreadable_file_fails(tmp_path, content):
    (tmp_path / "sample-board.json").write_bytes(content.encode("latin-1"))
    assert check_directory(tmp_path) != []


# ---- 出典付き定数（shared/constants/）----

VALID_CONSTANT = {
    "schemaVersion": 1,
    "id": "sample-constant",
    "name": "検査用の定数",
    "values": {"speed": copy.deepcopy(VALID_MATERIAL["properties"]["surfaceDensity"])},
}


def test_valid_constant_passes(tmp_path):
    write_material(tmp_path, VALID_CONSTANT, name="sample-constant")
    assert check_directory(tmp_path, CONSTANT_SCHEMA) == []


def test_repository_constants_pass():
    root = Path(__file__).resolve().parent.parent
    assert check_directory(root / "shared" / "constants", CONSTANT_SCHEMA) == []


CONSTANT_BROKEN_CASES = {
    "出典なし": lambda d: d["values"]["speed"].pop("source"),
    "信頼度なし": lambda d: d["values"]["speed"].pop("reliability"),
    "値が空": lambda d: d.update(values={}),
    "材料の形式で書いた": lambda d: d.update(properties=d.pop("values")),
}


@pytest.mark.parametrize("case", sorted(CONSTANT_BROKEN_CASES))
def test_broken_constant_fails(tmp_path, case):
    data = copy.deepcopy(VALID_CONSTANT)
    CONSTANT_BROKEN_CASES[case](data)
    write_material(tmp_path, data, name="sample-constant")
    assert check_directory(tmp_path, CONSTANT_SCHEMA) != []
