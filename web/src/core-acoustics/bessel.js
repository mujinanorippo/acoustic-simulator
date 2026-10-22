// 複素数引数のベッセル関数の比 J1(z)/J0(z)（有孔板の Maa 式で使う）
//
// 漸化式 J_{n−1}(z) + J_{n+1}(z) = (2n/z)·J_n(z)
//   出典: Fungrim / Encyclopedia of Mathematics「Bessel functions」、
//         Jentschura & Lötstedt「Numerical calculation of Bessel, Hankel and Airy functions」式(10a)
//         https://encyclopediaofmath.org/wiki/Bessel_functions
//         https://arxiv.org/pdf/1112.0072
// 比 r_n = J_n/J_{n−1} は r_n = 1 / (2n/z − r_{n+1})。十分大きな N で r_N = 0 から下向きに計算する
// （J_n は n が大きいほど小さくなる解なので、下向きの計算が安定する。Jentschura & Lötstedt の
// 「高い次数から下向きに漸化式を回す」方法）。|z| が大きくても桁あふれしない。
import * as cx from "./complex.js";

// 開始次数の余裕。|z| より大きい次数から始めれば r_N ≈ 0 の誤差は急速に消える。
// 余裕の大きさは数値実験（級数展開との照合テスト）で決めた値で、物理量ではない。
const START_ORDER_MARGIN = 40;

export function besselRatioJ1OverJ0(argument) {
  const startOrder = Math.ceil(cx.abs(argument)) + START_ORDER_MARGIN;
  let ratio = cx.ZERO;
  for (let order = startOrder; order >= 1; order -= 1) {
    ratio = cx.div(cx.ONE, cx.sub(cx.div(cx.complex(2 * order), argument), ratio));
  }
  return ratio;
}

/** 級数 J_n(z) = Σ (−1)^k (z/2)^(n+2k) / (k!·(n+k)!)（照合テスト用。|z| が小さいときだけ正確） */
export function besselJSeries(order, argument, terms) {
  const half = cx.scale(argument, 1 / 2);
  const halfSquaredNegated = cx.scale(cx.mul(half, half), -1);
  let term = cx.ONE;
  for (let i = 1; i <= order; i += 1) {
    term = cx.scale(cx.mul(term, half), 1 / i);
  }
  let sum = term;
  for (let k = 1; k < terms; k += 1) {
    term = cx.scale(cx.mul(term, halfSquaredNegated), 1 / (k * (order + k)));
    sum = cx.add(sum, term);
  }
  return sum;
}
