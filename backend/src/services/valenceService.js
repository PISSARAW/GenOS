'use strict';

/**
 * Valence fonctionnelle (HRL, sans prétention phénoménale).
 *
 * D(s) = Σ w_i·d_i(s) : distance globale à la zone viable, calculée sur des
 * variables machine mesurées (jamais d'émotions simulées). V(a|s) =
 * D(s) − E[D(s′|s,a)] : une action est fonctionnellement positive si elle
 * est prédite comme rapprochant de la zone viable. Les mêmes actions
 * changent donc de valeur selon l'état interne. Couche audit pour l'instant :
 * rankDrives() joint au plan ; la planification allostatique consommatrice
 * est l'étape suivante documentée.
 */

const DEFAULT_WEIGHTS = {
  energy: 1,
  memoryPressure: 1,
  socialState: 0.5,
  modelDrift: 1,
  contextPressure: 1,
  integrity: 1.5,
  stress: 1
};

const DRIVES = [
  { action: 'consolidate_memory', variable: 'memoryPressure' },
  { action: 'compact_context', variable: 'contextPressure' },
  { action: 'avoid_risky_exploration', variable: 'integrity', invert: true },
  { action: 'reduce_costly_fanout', variable: 'energy', invert: true },
  { action: 'slow_down', variable: 'stress' },
  { action: 'reverify_routing', variable: 'modelDrift' }
];

function neutral01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function deficitOf(variables, name) {
  const value = neutral01(variables[name]);
  if (name === 'energy' || name === 'integrity') return 1 - value;
  return value;
}

function weightsOf(weights) {
  const custom = weights || {};
  const resolved = {};
  for (const name of Object.keys(DEFAULT_WEIGHTS)) {
    const weight = Number(custom[name]);
    resolved[name] = Number.isFinite(weight) && weight >= 0 ? weight : DEFAULT_WEIGHTS[name];
  }
  return resolved;
}

function driveOf(variables, weights) {
  const data = variables || {};
  const resolved = weightsOf(weights);
  const parts = {};
  let distance = 0;
  for (const name of Object.keys(resolved)) {
    parts[name] = resolved[name] * deficitOf(data, name);
    distance += parts[name];
  }
  return { distance, parts };
}

function actionValue(current, predicted, weights) {
  return driveOf(current, weights).distance - driveOf(predicted, weights).distance;
}

function rankDrives(variables, weights) {
  const data = variables || {};
  const resolved = weightsOf(weights);
  return DRIVES
    .map((drive) => ({
      action: drive.action,
      variable: drive.variable,
      drive: resolved[drive.variable] * deficitOf(data, drive.variable)
    }))
    .sort((a, b) => b.drive - a.drive);
}

module.exports = { driveOf, actionValue, rankDrives, DEFAULT_WEIGHTS };
