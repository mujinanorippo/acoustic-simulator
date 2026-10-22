// 入力欄の値の読み取りと単位変換（開発設計書「単位のルール」：mm・% → SI の変換は画面との境目で1回だけ）
// 画面に触れない純粋な関数だけを置き、テストできるようにする。

const MM_PER_M = 1000;
const PERCENT = 100;
const PA_PER_GPA = 1e9;
const FULL_WIDTH_PATTERN = /[０-９．－＋，]/;

/**
 * 入力欄の文字列を数値にする。結果は { ok: true, value } か { ok: false, message }。
 * options: { min, max, allowZero }（min・max は画面の単位）
 */
export function parseNumberField(text, label, options = {}) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") {
    return { ok: false, message: `${label}が空欄です` };
  }
  if (FULL_WIDTH_PATTERN.test(trimmed)) {
    return { ok: false, message: `${label}は半角の数字で入力してください` };
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) {
    return { ok: false, message: `${label}に数字以外の文字が入っています` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `${label}が大きすぎます` };
  }
  if (value < 0 || (value === 0 && !options.allowZero)) {
    return {
      ok: false,
      message: `${label}は${options.allowZero ? "0以上" : "0より大きい数"}で入力してください`,
    };
  }
  if (options.min !== undefined && value < options.min) {
    return { ok: false, message: `${label}は ${options.min} 以上で入力してください` };
  }
  if (options.max !== undefined && value > options.max) {
    return { ok: false, message: `${label}は ${options.max} 以下で入力してください` };
  }
  return { ok: true, value };
}

export const mmToM = (valueMm) => valueMm / MM_PER_M;
export const percentToRatio = (valuePercent) => valuePercent / PERCENT;
export const gpaToPa = (valueGpa) => valueGpa * PA_PER_GPA;
export const ratioToPercent = (ratio) => ratio * PERCENT;
