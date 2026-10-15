'use strict';

// Statistiques appariees pour la campagne de changement de regime.
// Chaque paire compare adaptatif vs un controle sur la meme tache et seed.

function countDiscordant(pairs) {
  let better = 0;
  let worse = 0;
  for (const pair of pairs) {
    if (pair.adaptive && !pair.control) better += 1;
    if (!pair.adaptive && pair.control) worse += 1;
  }
  return { better, worse, total: pairs.length };
}

function pairedDifference(pairs) {
  const { better, worse, total } = countDiscordant(pairs);
  if (!total) return { diff: null, se: null, lo: null, hi: null, total: 0, better, worse };
  const diff = (better - worse) / total;
  const se = Math.sqrt((better + worse) / (total * total));
  const margin = 1.96 * se;
  return { diff, se, lo: diff - margin, hi: diff + margin, total, better, worse };
}

function binomialTail(n, k) {
  let cumulative = 0;
  let term = Math.pow(0.5, n);
  for (let i = 0; i <= n; i += 1) {
    if (i >= k) cumulative += term;
    term = (term * (n - i)) / (i + 1);
  }
  return cumulative;
}

function mcnemarP(better, worse) {
  const discordant = better + worse;
  if (!discordant) return 1;
  const extreme = Math.max(better, worse);
  const oneSided = binomialTail(discordant, extreme);
  return Math.min(1, 2 * oneSided);
}

function pairsFor(attempts, controlId) {
  const byKey = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.taskId}::${attempt.seed}`;
    if (!byKey.has(key)) byKey.set(key, {});
    byKey.get(key)[attempt.conditionId] = attempt;
  }
  const pairs = [];
  for (const entry of byKey.values()) {
    if (entry['genos-adaptive'] && entry[controlId]) {
      pairs.push({ adaptive: entry['genos-adaptive'].oraclePassed === true,
        control: entry[controlId].oraclePassed === true });
    }
  }
  return pairs;
}

function compareAgainst(attempts, controlId) {
  const pairs = pairsFor(attempts, controlId);
  const stats = pairedDifference(pairs);
  return { controlId, ...stats, mcnemarP: mcnemarP(stats.better, stats.worse) };
}

module.exports = { pairedDifference, mcnemarP, pairsFor, compareAgainst, countDiscordant };
