// 複素数の最小限の演算（JavaScript には複素数型がないため）。値は { re, im } の凍結オブジェクト。

export function complex(re, im = 0) {
  return Object.freeze({ re, im });
}

export const ZERO = complex(0);
export const ONE = complex(1);
export const IMAGINARY_UNIT = complex(0, 1);

export function add(left, right) {
  return complex(left.re + right.re, left.im + right.im);
}

export function sub(left, right) {
  return complex(left.re - right.re, left.im - right.im);
}

export function mul(left, right) {
  return complex(left.re * right.re - left.im * right.im, left.re * right.im + left.im * right.re);
}

export function scale(value, factor) {
  return complex(value.re * factor, value.im * factor);
}

export function div(left, right) {
  // 桁あふれを避けるため、大きい方の成分で割ってから計算する（Smith の方法）
  if (Math.abs(right.re) >= Math.abs(right.im)) {
    const ratio = right.im / right.re;
    const denominator = right.re + right.im * ratio;
    return complex(
      (left.re + left.im * ratio) / denominator,
      (left.im - left.re * ratio) / denominator,
    );
  }
  const ratio = right.re / right.im;
  const denominator = right.re * ratio + right.im;
  return complex(
    (left.re * ratio + left.im) / denominator,
    (left.im * ratio - left.re) / denominator,
  );
}

export function abs(value) {
  return Math.hypot(value.re, value.im);
}

export function abs2(value) {
  return value.re * value.re + value.im * value.im;
}

/** 主値の平方根（実部が 0 以上） */
export function sqrt(value) {
  const modulus = abs(value);
  const re = Math.sqrt((modulus + value.re) / 2);
  const im = Math.sqrt((modulus - value.re) / 2);
  return complex(re, value.im < 0 ? -im : im);
}

export function exp(value) {
  const magnitude = Math.exp(value.re);
  return complex(magnitude * Math.cos(value.im), magnitude * Math.sin(value.im));
}

export function cos(value) {
  return complex(
    Math.cos(value.re) * Math.cosh(value.im),
    -Math.sin(value.re) * Math.sinh(value.im),
  );
}

export function sin(value) {
  return complex(
    Math.sin(value.re) * Math.cosh(value.im),
    Math.cos(value.re) * Math.sinh(value.im),
  );
}

export function isFiniteComplex(value) {
  return Number.isFinite(value.re) && Number.isFinite(value.im);
}
