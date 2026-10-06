'use strict';

const TOPOLOGIES = ['trinity', 'a_team', 'biocenose', 'holobionte', 'syncytium', 'biome', 'rhizome', 'metapopulation'];

function stringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim());
}

function checkMemoryNumbers(memory, errors) {
  if (!Number.isFinite(memory.envelopeMb) || !Number.isFinite(memory.reserveMb)) errors.push('memory.valeurs-finies-requises');
  if (memory.workerEstimateMb !== undefined
    && (!Number.isFinite(memory.workerEstimateMb) || memory.workerEstimateMb <= 0)) errors.push('memory.estimation-invalide');
  if (memory.recoveryStableMs !== undefined
    && (!Number.isSafeInteger(memory.recoveryStableMs) || memory.recoveryStableMs < 0)) errors.push('memory.stabilite-invalide');
}

function checkTopology(config, errors) {
  if (!stringList(config.topologies)) errors.push('topologies-non-vides-requises');
  else if (config.topologies.some((entry) => !TOPOLOGIES.includes(entry))) errors.push('topologie-inconnue');
  if (!stringList(config.availableCapabilities)) errors.push('capacites-invalides');
}

function checkChecks(checks, errors) {
  if (!Array.isArray(checks)) return;
  for (const check of checks) {
    if (typeof check?.program !== 'string' || !check.program.trim()) errors.push('verification-programme-requis');
    if (!Array.isArray(check?.args) || check.args.some((arg) => typeof arg !== 'string')) errors.push('verification-arguments-invalides');
  }
}

function checkMissionBudget(budget, errors) {
  if (budget === undefined) return;
  if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
    errors.push('budget-mission-invalide');
    return;
  }
  for (const key of ['tokens', 'seconds']) {
    if (!Number.isFinite(budget[key]) || budget[key] <= 0) errors.push(`budget-mission.${key}-invalide`);
  }
  if (!Number.isFinite(budget.usd) || budget.usd < 0) errors.push('budget-mission.usd-invalide');
}

function checkAuthorityValues(config, errors) {
  const authority = config.authority;
  if (!authority || typeof authority !== 'object') return;
  for (const flag of ['allowEdit', 'allowTests', 'allowCommit']) {
    if (typeof authority[flag] !== 'boolean') errors.push(`authority.${flag}-booleen-requis`);
  }
  if (!stringList(authority.paths)) errors.push('authority.chemins-non-vides-requis');
  if (!stringList(authority.branches)) errors.push('authority.branches-non-vides-requises');
  else if (!authority.branches.includes('*') && !authority.branches.includes(config.branch)) errors.push('authority.branche-non-autorisee');
}

function validateExecutionConfig(config, errors) {
  checkTopology(config, errors);
  checkChecks(config.checks, errors);
  checkMemoryNumbers(config.memory || {}, errors);
  checkMissionBudget(config.missionBudgets, errors);
  checkAuthorityValues(config, errors);
  for (const flag of ['allowPush', 'allowMerge']) {
    if (typeof config[flag] !== 'boolean') errors.push(`${flag}-booleen-requis`);
  }
}

module.exports = { validateExecutionConfig };
