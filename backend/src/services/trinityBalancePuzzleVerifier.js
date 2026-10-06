'use strict';

function validCoins(pan) {
  return Array.isArray(pan) && pan.length > 0 && pan.every((coin) => Number.isInteger(coin) && coin >= 1 && coin <= 12)
    && new Set(pan).size === pan.length;
}

function weighingResult(weighing, oddCoin, direction) {
  const left = weighing.left.reduce((sum, coin) => sum + weight(coin, oddCoin, direction), 0);
  const right = weighing.right.reduce((sum, coin) => sum + weight(coin, oddCoin, direction), 0);
  return left > right ? 'left_heavy' : left < right ? 'right_heavy' : 'balance';
}

function weight(coin, oddCoin, direction) {
  if (coin !== oddCoin) return 1;
  return direction === 'heavy' ? 2 : 0;
}

function validWeighing(weighing) {
  if (!validCoins(weighing?.left) || !validCoins(weighing?.right)) return false;
  if (weighing.left.length !== weighing.right.length) return false;
  return weighing.left.every((coin) => !weighing.right.includes(coin));
}

function follow(tree, scenario, depth) {
  const { oddCoin, direction } = scenario;
  if (tree?.result) {
    return depth === 3 && tree.result.coin === oddCoin && tree.result.direction === direction;
  }
  if (depth >= 3 || !validWeighing(tree?.weighing)) return false;
  const branch = weighingResult(tree.weighing, oddCoin, direction);
  return follow(tree.branches?.[branch], scenario, depth + 1);
}

function verify(tree) {
  let covered = 0;
  for (let coin = 1; coin <= 12; coin += 1) {
    for (const direction of ['heavy', 'light']) {
      if (!follow(tree, { oddCoin: coin, direction }, 0)) return { verified: false, covered, total: 24, counterexample: { coin, direction } };
      covered += 1;
    }
  }
  return { verified: true, covered, total: 24, counterexample: null };
}

module.exports = { verify, validWeighing, weighingResult };
