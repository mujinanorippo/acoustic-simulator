"""材料データの出典チェック（開発設計書「データ形式・材料データ」「禁則：数値・根拠」）。

shared/materials/ の JSON がすべて material.schema.json に合っているか確かめる。
1件でも不合格なら終了コード 1 を返す。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "shared" / "schema" / "material.schema.json"
DEFAULT_MATERIALS_DIR = REPO_ROOT / "shared" / "materials"


def load_validator() -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


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


def check_directory(materials_dir: Path) -> list[str]:
    validator = load_validator()
    problems: list[str] = []
    for path in sorted(materials_dir.glob("*.json")):
        problems.extend(check_file(path, validator))
    return problems


def main(argv: list[str]) -> int:
    materials_dir = Path(argv[1]) if len(argv) > 1 else DEFAULT_MATERIALS_DIR
    problems = check_directory(materials_dir)
    for problem in problems:
        print(problem)
    count = len(list(materials_dir.glob("*.json")))
    print(f"材料ファイル {count} 件、問題 {len(problems)} 件")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
