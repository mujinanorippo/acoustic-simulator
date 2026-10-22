"""出典付きデータのチェック（開発設計書「データ形式・材料データ」「禁則：数値・根拠」）。

shared/materials/ の JSON が material.schema.json に、shared/constants/ の JSON が
constant.schema.json に合っているかを確かめる。1件でも不合格なら終了コード 1 を返す。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = REPO_ROOT / "shared" / "schema"
MATERIAL_SCHEMA = "material.schema.json"
CONSTANT_SCHEMA = "constant.schema.json"
DEFAULT_MATERIALS_DIR = REPO_ROOT / "shared" / "materials"
DEFAULT_CONSTANTS_DIR = REPO_ROOT / "shared" / "constants"


def load_validator(schema_name: str = MATERIAL_SCHEMA) -> Draft202012Validator:
    """schema_name の検査器を作る。他のスキーマへの参照（$ref）も解決できるようにする。"""
    schemas = {
        path.name: json.loads(path.read_text(encoding="utf-8"))
        for path in SCHEMA_DIR.glob("*.schema.json")
    }
    registry = Registry().with_resources(
        (name, Resource.from_contents(schema)) for name, schema in schemas.items()
    )
    schema = schemas[schema_name]
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())


def check_file(path: Path, validator: Draft202012Validator) -> list[str]:
    """1ファイルを検査し、問題の説明の一覧を返す（空なら合格）。"""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return [f"{path.name}: 読み込めない ({error})"]
    problems = []
    for error in validator.iter_errors(data):
        location = "/".join(str(part) for part in error.absolute_path) or "(先頭)"
        problems.append(f"{path.name}: {location}: {error.message}")
    if isinstance(data, dict) and data.get("id") != path.stem:
        problems.append(f"{path.name}: id がファイル名と一致しない")
    return problems


def check_directory(directory: Path, schema_name: str = MATERIAL_SCHEMA) -> list[str]:
    validator = load_validator(schema_name)
    problems: list[str] = []
    for path in sorted(directory.glob("*.json")):
        problems.extend(check_file(path, validator))
    return problems


def main(argv: list[str]) -> int:
    materials_dir = Path(argv[1]) if len(argv) > 1 else DEFAULT_MATERIALS_DIR
    constants_dir = Path(argv[2]) if len(argv) > 2 else DEFAULT_CONSTANTS_DIR  # noqa: PLR2004
    total = 0
    for label, directory, schema_name in (
        ("材料", materials_dir, MATERIAL_SCHEMA),
        ("定数", constants_dir, CONSTANT_SCHEMA),
    ):
        problems = check_directory(directory, schema_name)
        for problem in problems:
            print(problem)
        count = len(list(directory.glob("*.json")))
        print(f"{label}ファイル {count} 件、問題 {len(problems)} 件")
        total += len(problems)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
