# 出典付き定数

物理定数や周波数帯域表など、材料に属さない数値を置く。1ファイル1テーマの JSON で、形式は `shared/schema/constant.schema.json`（数値ごとの書き方は材料データと同じ：値・単位・出典・確認日・信頼度）。

ブラウザ側（`web/src/core-acoustics/constants.js`）と照合用 Python（`tests/reference_py/constants.py`）は、どちらもこの JSON から値を読む。数値をコードに直接書かない。

| ファイル | 中身 |
| --- | --- |
| `air.json` | 20 °C の空気の音速・密度、粘性係数（Sutherland の式の定数） |
| `frequency-bands.json` | 全モジュール共通の1/3オクターブ帯域表（50 Hz〜5000 Hz、Rw 評価は 100〜3150 Hz） |
| `calculation.json` | 文献に根拠のある計算条件（拡散入射の上限角など） |
