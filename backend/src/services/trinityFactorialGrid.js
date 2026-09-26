'use strict';

const crypto = require('crypto');

function cartesianProduct(...arrays) {
  return arrays.reduce((acc, arr) => acc.flatMap(x => arr.map(y => [...(Array.isArray(x) ? x : [x]), y])), [[]]);
}

function generateFactorialGrid(input) {
  const { factors, replications = 1, randomize = true, seed } = input;
  const factorNames = Object.keys(factors);
  const factorValues = factorNames.map(name => factors[name]);
  const combinations = cartesianProduct(...factorValues);
  const grid = combinations.map((combo, idx) => {
    const cell = { id: `cell_${idx}`, factors: {} };
    factorNames.forEach((name, i) => { cell.factors[name] = combo[i]; });
    return cell;
  });
  let cells = [];
  for (let r = 0; r < replications; r++) {
    const repCells = grid.map((cell, idx) => ({
      ...cell,
      replication: r,
      cellId: `${cell.id}_rep${r}`,
      seed: seed ? `${seed}_${cell.id}_rep${r}` : undefined
    }));
    cells.push(...repCells);
  }
  if (randomize) {
    const rng = seed ? mulberry32(hashString(seed)) : Math.random;
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
  }
  return {
    experimentalDesignId: `factorial-v1-${crypto.randomBytes(8).toString('hex')}`,
    factors: factorNames,
    factorLevels: factors,
    replications,
    totalCells: cells.length,
    cells,
    randomize,
    seed
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function anovaAnalysis(results, factors) {
  const factorNames = Object.keys(factors);
  const grouped = {};
  for (const result of results) {
    const key = factorNames.map(name => result.factors[name]).join('|');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(result.score);
  }
  const means = {};
  for (const [key, scores] of Object.entries(grouped)) {
    means[key] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  const grandMean = Object.values(means).reduce((a, b) => a + b, 0) / Object.keys(means).length;
  let ssTotal = 0, ssBetween = 0;
  for (const [key, scores] of Object.entries(grouped)) {
    const mean = means[key];
    for (const score of scores) ssTotal += (score - grandMean) ** 2;
    ssBetween += scores.length * (mean - grandMean) ** 2;
  }
  const ssWithin = ssTotal - ssBetween;
  const dfBetween = Object.keys(means).length - 1;
  const dfWithin = results.length - Object.keys(means).length;
  const msBetween = dfBetween > 0 ? ssBetween / dfBetween : 0;
  const msWithin = dfWithin > 0 ? ssWithin / dfWithin : 0;
  const fStat = msWithin > 0 ? msBetween / msWithin : 0;
  return { ssTotal, ssBetween, ssWithin, dfBetween, dfWithin, msBetween, msWithin, fStat, grandMean, cellMeans: means };
}

function hierarchicalModel(results, factors) {
  const factorNames = Object.keys(factors);
  const overall = results.reduce((s, r) => s + r.score, 0) / results.length;
  const effects = {};
  for (const name of factorNames) {
    const levels = [...new Set(results.map(r => r.factors[name]))];
    const levelMeans = {};
    for (const level of levels) {
      const subset = results.filter(r => r.factors[name] === level);
      levelMeans[level] = subset.reduce((s, r) => s + r.score, 0) / subset.length;
    }
    effects[name] = Object.fromEntries(Object.entries(levelMeans).map(([l, m]) => [l, m - overall]));
  }
  const interactions = pairwiseInteractions({ results, factorNames, effects, overall });
  return { mainEffects: effects, interactions };
}

function pairwiseInteractions(input) {
  const { results, factorNames, effects, overall } = input;
  const interactions = {};
  for (let i = 0; i < factorNames.length; i++) {
    for (let j = i + 1; j < factorNames.length; j++) {
      const name = `${factorNames[i]}×${factorNames[j]}`;
      interactions[name] = interactionCells({ results, factorA: factorNames[i], factorB: factorNames[j], effects, overall });
    }
  }
  return interactions;
}

function interactionCells(input) {
  const { results, factorA, factorB, effects, overall } = input;
  const levelsA = [...new Set(results.map(r => r.factors[factorA]))];
  const levelsB = [...new Set(results.map(r => r.factors[factorB]))];
  const cells = {};
  for (const a of levelsA) {
    for (const b of levelsB) {
      const subset = results.filter(r => r.factors[factorA] === a && r.factors[factorB] === b);
      if (subset.length) {
        const mean = subset.reduce((s, r) => s + r.score, 0) / subset.length;
        cells[`${a}|${b}`] = mean - overall - (effects[factorA][a] || 0) - (effects[factorB][b] || 0);
      }
    }
  }
  return cells;
}

function varianceCorrection(results, design) {
  if (!design.randomize) return { corrected: false, reason: 'not_randomized' };
  const repGroups = {};
  for (const result of results) {
    const key = result.replication;
    if (!repGroups[key]) repGroups[key] = [];
    repGroups[key].push(result.score);
  }
  const repMeans = Object.fromEntries(Object.entries(repGroups).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  const overallMean = Object.values(repMeans).reduce((a, b) => a + b, 0) / Object.keys(repMeans).length;
  const repVariance = Object.values(repMeans).reduce((s, m) => s + (m - overallMean) ** 2, 0) / Object.keys(repMeans).length;
  return { corrected: true, replicationVariance: repVariance, replicationMeans: repMeans };
}

module.exports = {
  generateFactorialGrid,
  anovaAnalysis,
  hierarchicalModel,
  varianceCorrection,
  cartesianProduct
};