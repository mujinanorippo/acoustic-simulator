"""依存ライブラリが「空ではなく、決めた版のものが入っている」ことを確かめる（実行順の最初の段階）。"""

import importlib
import re
import sys
from importlib.metadata import version
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PIN = re.compile(r"^([A-Za-z0-9_.-]+)==([0-9][^ \\]*)")


def pins(file_name: str) -> list[tuple[str, str]]:
    lines = (ROOT / "compute" / file_name).read_text(encoding="utf-8").splitlines()
    return [match.groups() for line in lines if (match := PIN.match(line))]


ALL_PINS = pins("requirements.txt") + pins("requirements-dev.txt")
# 直接使うもの（requirements*.in に書いたもの）は import して中身を確かめる
DIRECT = {
    "numpy": "numpy",
    "pytest": "pytest",
    "hypothesis": "hypothesis",
    "jsonschema": "jsonschema",
}


def test_python_version_matches_file():
    wanted = (ROOT / ".python-version").read_text(encoding="utf-8").strip()
    assert ".".join(map(str, sys.version_info[:3])) == wanted


def test_requirements_are_fully_pinned_with_hashes():
    assert ALL_PINS, "requirements*.txt に固定された版が1つもない"
    for file_name in ("requirements.txt", "requirements-dev.txt"):
        text = (ROOT / "compute" / file_name).read_text(encoding="utf-8")
        # どの固定にも少なくとも1つハッシュが付いている（pip install --require-hashes の前提）
        assert text.count("--hash=sha256:") >= len(pins(file_name)) > 0


@pytest.mark.parametrize(("name", "pinned"), ALL_PINS)
def test_installed_version_matches_pin(name, pinned):
    assert version(name) == pinned


@pytest.mark.parametrize("module_name", sorted(DIRECT.values()))
def test_direct_dependency_is_importable_and_not_empty(module_name):
    module = importlib.import_module(module_name)
    assert len(dir(module)) > 10
    assert Path(module.__file__).stat().st_size > 0
