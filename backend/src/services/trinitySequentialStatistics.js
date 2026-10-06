'use strict';
function digamma(value) {
  let x = value, result = 0;
  while (x < 8) { result -= 1 / x; x += 1; }
  const inverse = 1 / x, square = inverse * inverse;
  return result + Math.log(x) - inverse / 2 - square / 12 + square * square / 120 - square * square * square / 252;
}
function expectedInformationGain(arm) {
  const a = arm.alpha, b = arm.beta;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const p = a / (a + b), q = 1 - p;
  const predictiveEntropy = -p * Math.log(p) - q * Math.log(q);
  const expectedEntropy = digamma(a + b + 1) - p * digamma(a + 1) - q * digamma(b + 1);
  return Math.max(0, (predictiveEntropy - expectedEntropy) / Math.LN2);
}
module.exports = { expectedInformationGain };
