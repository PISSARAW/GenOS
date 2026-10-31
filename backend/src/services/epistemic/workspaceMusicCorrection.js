'use strict';

const BEATS = Object.freeze({ noire: 1, blanche: 2, ronde: 4 });

function validBars(remaining = 4) {
  if (remaining === 0) return [[]];
  return Object.entries(BEATS).flatMap(([note, beats]) => beats > remaining ? []
    : validBars(remaining - beats).map(tail => [note, ...tail]));
}

function minimalCorrection(original, candidate, strategy) {
  if (!Array.isArray(original) || original.length > 64 || candidate.length > 4) {
    throw new Error('music_correction_outside_domain');
  }
  const distance = strategy === 'source_recompute' ? iterativeDistance : recursiveDistance;
  const cost = distance(original, candidate);
  return validBars().every(bar => distance(original, bar) >= cost);
}

function iterativeDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const replacement = previous[j - 1] + Number(left[i - 1] !== right[j - 1]);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, replacement);
    }
    previous = current;
  }
  return previous[right.length];
}

function recursiveDistance(left, right) {
  const memo = new Map();
  function distance(i, j) {
    if (i === left.length) return right.length - j;
    if (j === right.length) return left.length - i;
    const key = `${i}:${j}`;
    if (memo.has(key)) return memo.get(key);
    const replacement = Number(left[i] !== right[j]) + distance(i + 1, j + 1);
    const cost = Math.min(replacement, 1 + distance(i + 1, j), 1 + distance(i, j + 1));
    memo.set(key, cost);
    return cost;
  }
  return distance(0, 0);
}

module.exports = { minimalCorrection };
