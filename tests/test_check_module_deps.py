"""依存チェックが、決められていない読み込みを確実に検出することを確かめる（意図的エラー）。"""

from pathlib import Path

import pytest
from check_module_deps import check_js, check_python


def make_js(src: Path, module: str, body: str, name: str = "index.js") -> None:
    (src / module).mkdir(parents=True, exist_ok=True)
    (src / module / name).write_text(body, encoding="utf-8")


def test_repository_passes():
    root = Path(__file__).resolve().parent.parent
    assert check_js(root / "web" / "src") == []
    assert check_python(root / "compute") == []


@pytest.mark.parametrize(
    ("module", "body"),
    [
        ("viewer", 'import * as THREE from "three";'),
        ("viewer", 'import { box } from "../core-model/box.js";'),
        ("ui", 'import { draw } from "../viewer/draw.js";'),
        ("core-acoustics", 'import { tmm } from "./tmm.js";'),
    ],
)
def test_allowed_js_imports_pass(tmp_path, module, body):
    make_js(tmp_path, module, body)
    assert check_js(tmp_path) == []


@pytest.mark.parametrize(
    ("module", "body"),
    [
        ("core-acoustics", 'import * as THREE from "three";'),
        ("core-acoustics", 'import { draw } from "../viewer/draw.js";'),
        ("core-model", 'import { tmm } from "../core-acoustics/tmm.js";'),
        ("viewer", 'import { save } from "../io/save.js";'),
        ("io", 'export { draw } from "../ui/draw.js";'),
        ("core-model", 'const mod = await import("../ui/x.js");'),
        ("core-model", 'import "../viewer/side-effect.js";'),
        ("ui", 'import fc from "fast-check";'),
    ],
)
def test_forbidden_js_imports_fail(tmp_path, module, body):
    make_js(tmp_path, module, body)
    assert check_js(tmp_path) != []


def test_test_only_package_allowed_in_test_file(tmp_path):
    make_js(tmp_path, "ui", 'import fc from "fast-check";', name="x.test.js")
    assert check_js(tmp_path) == []


@pytest.mark.parametrize(
    ("module", "body", "ok"),
    [
        ("compute_fdtd", "import numpy as np\nimport json", True),
        ("compute_fdtd", "import pyvista", False),
        ("compute_fdtd", "from matplotlib import pyplot", False),
        ("compute_viz", "import pyvista", True),
        ("compute_viz", "import compute_fdtd", False),
    ],
)
def test_python_imports(tmp_path, module, body, ok):
    (tmp_path / module).mkdir()
    (tmp_path / module / "a.py").write_text(body, encoding="utf-8")
    assert (check_python(tmp_path) == []) is ok
