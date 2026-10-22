// 拡散入射の角度積分 ∫_0^U τ(u) du（u = sin²θ）を、鋭い共鳴の山を取りこぼさずに計算する。
//
// 空気層をはさむ二重壁などでは、特定の角度で τ が幅 10⁻⁵ 程度の鋭い山になる。等間隔の点では
// 山を取りこぼし、数 dB の誤差が出る（照合用 Python の細かい台形則との比較で確認した）。
// τ = 4/|D(u)|² の D は u について解析的なので、山の位置は D の複素零点 u0 の実部、山の幅は
// 虚部の大きさになる。そこで
//   1. 粗い等間隔の点で |D| の極小を探す
//   2. 極小の近くから Newton 法で D の複素零点 u0 を求める
//   3. u0 の実部のまわりに、幅 |Im u0| に合わせた細かい点を足す
//   4. 全部の点で台形則
// とする。数値計算の工夫であり、物理モデルではない。精度は照合用 Python（2^20 区間の台形則）
// との比較テストで確かめる。
import * as cx from "./complex.js";

// 粗い格子の区間数
export const COARSE_INTERVALS = 2048;
// Newton 法の設定
const NEWTON_MAX_ITERATIONS = 40;
// 収束判定（u の絶対値）。山の幅（1e-5 程度）より十分小さく、丸め誤差（D の値の 1e-16 倍程度が
// 1e-12 程度の揺れになる）より大きい値にする
const NEWTON_TOLERANCE = 1e-10;
// 数値微分の刻み（粗い格子間隔に対する比）
const DERIVATIVE_STEP_RATIO = 1e-4;
// 山のまわりの点：中心から幅 × FIRST_OFFSET を最初に、FACTOR 倍ずつ広げ、粗い格子間隔の
// REACH 倍まで置く
const PEAK_FIRST_OFFSET = 0.02;
const PEAK_OFFSET_FACTOR = 1.05;
const PEAK_REACH_IN_COARSE_STEPS = 2;
// 零点として採用する範囲（粗い格子間隔の何個分まで離れてよいか）
const ROOT_SEARCH_RADIUS_IN_COARSE_STEPS = 2;
// 幅がほぼ 0 の山でも点の置き方が破綻しないための下限（粗い格子間隔に対する比）
const MIN_WIDTH_RATIO = 1e-9;

function newtonRoot(denominator, start, step) {
  let point = cx.complex(start);
  const derivativeStep = step * DERIVATIVE_STEP_RATIO;
  for (let iteration = 0; iteration < NEWTON_MAX_ITERATIONS; iteration += 1) {
    const value = denominator(point);
    const forward = denominator(cx.add(point, cx.complex(derivativeStep)));
    const backward = denominator(cx.sub(point, cx.complex(derivativeStep)));
    const derivative = cx.scale(cx.sub(forward, backward), 1 / (2 * derivativeStep));
    const delta = cx.div(value, derivative);
    if (!cx.isFiniteComplex(delta)) {
      return null;
    }
    point = cx.sub(point, delta);
    if (cx.abs(delta) <= NEWTON_TOLERANCE) {
      return point;
    }
  }
  return null;
}

function localMinima(magnitudes) {
  const indices = [];
  for (let i = 0; i < magnitudes.length; i += 1) {
    const left = i === 0 ? Infinity : magnitudes[i - 1];
    const right = i === magnitudes.length - 1 ? Infinity : magnitudes[i + 1];
    if (magnitudes[i] < left && magnitudes[i] <= right) {
      indices.push(i);
    }
  }
  return indices;
}

function peakPoints(center, width, step, upper) {
  const points = [center];
  const reach = PEAK_REACH_IN_COARSE_STEPS * step;
  for (let offset = width * PEAK_FIRST_OFFSET; offset < reach; offset *= PEAK_OFFSET_FACTOR) {
    points.push(center - offset, center + offset);
  }
  return points.filter((point) => point > 0 && point < upper);
}

/**
 * ∫_0^upper integrand(u) du。integrand は τ(u)（実数の u）、denominator は D(u)（複素数の u）。
 */
export function integrateWithResonances(integrand, denominator, upper) {
  const step = upper / COARSE_INTERVALS;
  const coarse = Array.from({ length: COARSE_INTERVALS + 1 }, (_, i) => i * step);
  const magnitudes = coarse.map((point) => cx.abs(denominator(cx.complex(point))));
  const extra = [];
  for (const index of localMinima(magnitudes)) {
    const root = newtonRoot(denominator, coarse[index], step);
    const isNearby =
      root !== null &&
      Math.abs(root.re - coarse[index]) <= ROOT_SEARCH_RADIUS_IN_COARSE_STEPS * step &&
      Math.abs(root.im) < step;
    if (isNearby) {
      const width = Math.max(Math.abs(root.im), MIN_WIDTH_RATIO * step);
      extra.push(...peakPoints(root.re, width, step, upper));
    }
  }
  const points = [...new Set([...coarse, ...extra])].sort((left, right) => left - right);
  let sum = 0;
  let previousValue = integrand(points[0]);
  for (let i = 1; i < points.length; i += 1) {
    const value = integrand(points[i]);
    sum += ((value + previousValue) / 2) * (points[i] - points[i - 1]);
    previousValue = value;
  }
  return sum;
}
