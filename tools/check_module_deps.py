"""モジュール間の依存チェック（開発設計書「システム構成とモジュール分割」）。

各モジュールが「依存してよいもの」以外を読み込んでいたら終了コード 1 を返す。
JavaScript（web/src/<モジュール>/）と Python（compute/<モジュール>/）を対象にする。
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# 開発設計書の表と同じ内容。変えるときは設計書を先に直す。
JS_ALLOWED: dict[str, set[str]] = {
    "core-acoustics": {"materials", "schema", "constants"},
    "core-model": {"schema"},
    "viewer": {"three", "core-model"},
    "ui": {"viewer", "core-acoustics", "core-model"},
    "io": {"schema", "core-model"},
}
PY_ALLOWED: dict[str, set[str]] = {
    "compute_fdtd": {"numpy", "schema"},
    "compute_viz": {"pyvista"},
}
# 照合用 Python（tests/reference_py）。配布しないが、計算コアと同じく NumPy だけに頼る
PY_REFERENCE_ALLOWED: dict[str, set[str]] = {"reference_py": {"numpy"}}
# テスト専用ファイルだけが使ってよい道具と、共通テストデータ（tests/data/）
TEST_DATA = "test-data"
TEST_ONLY_PACKAGES = {"vitest", "fast-check", "pytest", "hypothesis", TEST_DATA}
PY_STDLIB = set(sys.stdlib_module_names)

IMPORT_PATTERN = re.compile(
    r"""(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]"""
    r"""|import\s*\(\s*['"]([^'"]+)['"]\s*\)"""
    r"""|import\s+['"]([^'"]+)['"]"""
)


def js_target(source_file: Path, specifier: str, src_root: Path) -> str:
    """import 先がどのモジュール（または外部パッケージ）かを返す。"""
    if not specifier.startswith("."):
        parts = specifier.split("/")
        return "/".join(parts[:2]) if specifier.startswith("@") else parts[0]
    resolved = (source_file.parent / specifier).resolve()
    shared_root = (REPO_ROOT / "shared").resolve()
    if resolved.is_relative_to((REPO_ROOT / "tests" / "data").resolve()):
        return TEST_DATA
    if resolved.is_relative_to(shared_root):
        return resolved.relative_to(shared_root).parts[0]
    if resolved.is_relative_to(src_root):
        return resolved.relative_to(src_root).parts[0]
    return f"(範囲外:{specifier})"


def check_js(src_root: Path) -> list[str]:
    problems = []
    for module, allowed in JS_ALLOWED.items():
        for path in sorted((src_root / module).rglob("*.js")):
            is_test = path.name.endswith(".test.js")
            text = path.read_text(encoding="utf-8")
            for match in IMPORT_PATTERN.finditer(text):
                specifier = next(group for group in match.groups() if group)
                target = js_target(path, specifier, src_root.resolve())
                if target == module or target in allowed:
                    continue
                if is_test and target in TEST_ONLY_PACKAGES:
                    continue
                rel = path.relative_to(src_root)
                problems.append(f"{rel}: '{specifier}' は {module} から読み込めない")
    return problems


def python_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names.add(node.module.split(".")[0])
    return names


def check_python(compute_root: Path, rules: dict[str, set[str]] | None = None) -> list[str]:
    problems = []
    for module, allowed in (PY_ALLOWED if rules is None else rules).items():
        for path in sorted((compute_root / module).rglob("*.py")):
            for name in sorted(python_imports(path)):
                if name in PY_STDLIB or name == module or name in allowed:
                    continue
                rel = path.relative_to(compute_root)
                problems.append(f"{rel}: '{name}' は {module} から読み込めない")
    return problems


def main(argv: list[str]) -> int:
    src_root = Path(argv[1]) if len(argv) > 1 else REPO_ROOT / "web" / "src"
    compute_root = Path(argv[2]) if len(argv) > 2 else REPO_ROOT / "compute"  # noqa: PLR2004
    tests_root = Path(argv[3]) if len(argv) > 3 else REPO_ROOT / "tests"  # noqa: PLR2004
    problems = (
        check_js(src_root)
        + check_python(compute_root)
        + check_python(tests_root, PY_REFERENCE_ALLOWED)
    )
    for problem in problems:
        print(problem)
    print(f"依存違反 {len(problems)} 件")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
