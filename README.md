# acoustic-simulator

配信部屋・防音ブース向けの音響シミュレーター（開発中）。

ブラウザ上で部屋の形をブロックで作り、壁の積層構造・開口部・音源・マイクを設定して、遮音量・残響時間・反射・定在波・室内の音圧分布を計算する。重い波動計算（FDTD）は Google Colab または手元の PC で実行する。

## 状態

フェーズ0（開発の土台づくり）。まだ利用できる機能はない。

## 設計資料

- 仕様書（何を作るか）・開発設計書（どう作るか・禁則）: `docs/README.md` を参照

## 開発環境

| 対象 | 版 |
| --- | --- |
| Node.js | `.nvmrc` に記載 |
| Python | `.python-version` に記載 |
| JavaScript の依存 | `web/package-lock.json` で完全固定 |
| Python の依存 | `compute/requirements*.txt` で完全固定 |

```bash
# ブラウザ側
cd web && npm ci && npm run check

# Python 側（Python 3.12）
pip install -r compute/requirements.txt -r compute/requirements-dev.txt
ruff check . && ruff format --check . && pytest
python tools/check_module_deps.py
python tools/check_materials.py
```

## ライセンス

GNU Affero General Public License v3.0（`LICENSE` を参照）。取り込んだ外部コードの著作権表示とライセンス文は `third_party/` に置く。
