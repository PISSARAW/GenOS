'use strict';

/**
 * Schéma de configuration versionnée d'un projet Ontogenèse (ADR 0235).
 * Pur et déterministe : aucune E/S, aucun élargissement implicite.
 */

const CONFIG_VERSION = 1;
const DEFAULT_BRANCH = 'codex/ontogenesis';

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    branch: DEFAULT_BRANCH,
    budgets: { tokens: 140000, usd: 1, seconds: 120 },
    topologies: ['trinity'],
    memory: { envelopeMb: 2048, reserveMb: 512 },
    allowPush: false,
    allowMerge: false,
    authority: { allowEdit: true, allowTests: true, allowCommit: true, paths: ['*'], branches: [DEFAULT_BRANCH] }
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkBudgets(config, errors) {
  const budgets = config.budgets || {};
  if (!(budgets.tokens > 0)) errors.push('budgets.tokens-positif-requis');
  if (!(budgets.seconds > 0)) errors.push('budgets.seconds-positif-requis');
}

function checkMemory(config, errors) {
  const memory = config.memory || {};
  if (!(memory.envelopeMb > 0)) errors.push('memory.envelopeMb-positif-requis');
  if (!(memory.reserveMb >= 0)) errors.push('memory.reserveMb-negatif-interdit');
  if (memory.reserveMb >= memory.envelopeMb) errors.push('memory.reserve-inferieure-enveloppe');
}

function checkAuthority(config, errors) {
  const authority = config.authority || {};
  if (!isPlainObject(authority)) {
    errors.push('authority-requise');
    return;
  }
  if (!Array.isArray(authority.branches)) errors.push('authority.branches-requises');
  if (!Array.isArray(authority.paths)) errors.push('authority.paths-requis');
}

function validateProjectConfig(input) {
  const config = Object.assign(defaultConfig(), input || {});
  const errors = [];
  if (config.version !== CONFIG_VERSION) errors.push('version-inconnue');
  if (!config.branch || typeof config.branch !== 'string') errors.push('branch-requise');
  if (!isPlainObject(config.budgets)) errors.push('budgets-requis');
  else checkBudgets(config, errors);
  if (!isPlainObject(config.memory)) errors.push('memory-requis');
  else checkMemory(config, errors);
  if (config.allowPush === true) errors.push('allowPush-interdit-par-defaut');
  if (config.allowMerge === true) errors.push('allowMerge-interdit-par-defaut');
  checkAuthority(config, errors);
  return { ok: errors.length === 0, errors, config };
}

module.exports = { CONFIG_VERSION, DEFAULT_BRANCH, defaultConfig, validateProjectConfig };
