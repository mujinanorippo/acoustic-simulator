// ESLint 設定（開発設計書「コーディング規約」「禁則事項」に対応）
import js from "@eslint/js";
import globals from "globals";

// 計算コア：画面・時刻・乱数・グローバル状態に触れない（禁則：コード）
const PURE_CORE_RESTRICTED_GLOBALS = [
  { name: "window", message: "計算コアから画面に触れない" },
  { name: "document", message: "計算コアから画面に触れない" },
  { name: "localStorage", message: "計算コアから保存領域に触れない" },
  { name: "fetch", message: "計算コアから通信しない" },
];
const PURE_CORE_RESTRICTED_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: "計算コアで乱数を使わない",
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: "計算コアで時刻を使わない",
  },
  { selector: "NewExpression[callee.name='Date']", message: "計算コアで時刻を使わない" },
  {
    selector: "BinaryExpression[operator=/^[!=]==?$/] > Literal[raw=/\\./]",
    message: "浮動小数点を == で比べない。許容差で比べる",
  },
];

export default [
  { ignores: ["node_modules/", "dist/", "coverage/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-console": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "id-length": ["error", { min: 2, exceptions: ["i", "j", "k", "_"], properties: "never" }],
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  {
    files: ["src/core-acoustics/**/*.js", "src/core-model/**/*.js"],
    rules: {
      "no-restricted-globals": ["error", ...PURE_CORE_RESTRICTED_GLOBALS],
      "no-restricted-syntax": ["error", ...PURE_CORE_RESTRICTED_SYNTAX],
      "no-magic-numbers": ["error", { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true }],
    },
  },
  {
    files: ["**/*.test.js", "*.config.js", "e2e/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-magic-numbers": "off", "max-lines-per-function": "off" },
  },
];
