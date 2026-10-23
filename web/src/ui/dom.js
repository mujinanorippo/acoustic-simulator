// 画面部品の小さな道具：要素の作成、エラーダイアログ（CAD らしい OK ボタンのダイアログ。トーストは使わない）

export function create(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false)
      node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

export function showError(title, messages) {
  const dialog = document.getElementById("error-dialog");
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("ul").replaceChildren(...messages.map((text) => create("li", { text })));
  dialog.showModal();
}

export function runSafely(title, action) {
  try {
    action();
  } catch (error) {
    // 計算コアのエラーは番号付きの文言をそのまま見せる。想定外のエラーも握りつぶさない
    showError(title, [error.message]);
  }
}

/** 出典へのリンク（新しいタブで開く） */
export function sourceLink(source) {
  return create("a", { href: source.url, target: "_blank", rel: "noopener", text: source.title });
}

/** 表を作る。headers は見出しの並び、rows は各行のセル（文字列または要素）の並び */
export function table(headers, rows, className = "results") {
  // 数値だけのセルは右寄せ、文字のセルは左寄せにする
  const cell = (tag, content) =>
    create(
      tag,
      { class: typeof content === "string" && /^[-\d.]+$/.test(content) ? "number" : "text" },
      [typeof content === "string" ? document.createTextNode(content) : content],
    );
  return create("div", { class: "table-scroll" }, [
    create("table", { class: className }, [
      create("thead", {}, [
        create(
          "tr",
          {},
          headers.map((header) => cell("th", header)),
        ),
      ]),
      create(
        "tbody",
        {},
        rows.map((row) =>
          create(
            "tr",
            {},
            row.map((item) => cell("td", item)),
          ),
        ),
      ),
    ]),
  ]);
}
