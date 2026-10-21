'use strict';

/**
 * Schéma de configuration versionnée d'un projet Ontogenèse (ADR 0235).
 * Pur et déterministe : aucune E/S, aucun élargissement implicite.
 */

const { validateExecutionConfig } = require('./configValidation');

const CONFIG_VERSION = 2;
const LEGACY_CONFIG_VERSION = 1;
const DEFAULT_BRANCH = 'codex/ontogenesis';

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    branch: DEFAULT_BRANCH,
    budgets: { tokens: 140000, usd: 1, seconds: 120 },
    topologies: ['trinity'],
    availableCapabilities: ['execute', 'verify', 'coordinate', 'analyze', 'observe'],
    checks: [{ program: 'npm', args: ['test'] }],
    memory: { envelopeMb: 2048, reserveMb: 512 },
    allowPush: false,
    allowMerge: false,
    durability: { recoveryPolicy: 'reconcile', ambiguousOutcome: 'escalate' },
    retention: { artifactsDays: 30, evidenceDays: 365, quarantineDays: 7 },
    daemonStewardship: {
      enabled: true, autoEnqueue: true, eligibleStatuses: ['REPAIRABLE'],
      maxOpenTasks: 3, requireLiveDaemon: true
    },
    publication: { enabled: false },
    merge: { enabled: false },
    authority: { allowEdit: true, allowTests: true, allowCommit: true, paths: ['*'], branches: [DEFAULT_BRANCH], rules: [] }
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkBudgets(config, errors) {
  const budgets = config.budgets || {};
  if (!Number.isFinite(budgets.tokens) || !(budgets.tokens > 0)) errors.push('budgets.tokens-positif-requis');
  if (!Number.isFinite(budgets.usd) || !(budgets.usd >= 0)) errors.push('budgets.usd-negatif-interdit');
  if (!Number.isFinite(budgets.seconds) || !(budgets.seconds > 0)) errors.push('budgets.seconds-positif-requis');
  checkCollections(config, errors);
}

function checkCollections(config, errors) {
  if (config.topologies !== undefined && !Array.isArray(config.topologies)) {
    errors.push('topologies-tableau-requis');
  }
  if (config.availableCapabilities !== undefined
    && (!Array.isArray(config.availableCapabilities) || config.availableCapabilities.length === 0)) {
    errors.push('capacites-tableau-requis');
  }
}

function checkMemory(config, errors) {
  const memory = config.memory || {};
  if (!(memory.envelopeMb > 0)) errors.push('memory.envelopeMb-positif-requis');
  if (!(memory.reserveMb >= 0)) errors.push('memory.reserveMb-negatif-interdit');
  if (memory.reserveMb >= memory.envelopeMb) errors.push('memory.reserve-inferieure-enveloppe');
}

function checkExecution(config, errors) {
  if (!Array.isArray(config.checks) || !config.checks.length) errors.push('verifications-requises');
  else for (const check of config.checks) {
    if (!check || typeof check.program !== 'string' || !Array.isArray(check.args)) errors.push('verification-invalide');
  }
}

function checkAuthority(config, errors) {
  const authority = config.authority || {};
  if (!isPlainObject(authority)) {
    errors.push('authority-requise');
    return;
  }
  if (!Array.isArray(authority.branches)) errors.push('authority.branches-requises');
  if (!Array.isArray(authority.paths)) errors.push('authority.paths-requis');
  checkRules(authority, errors);
}

function checkRules(authority, errors) {
  if (authority.rules === undefined) return;
  if (!Array.isArray(authority.rules)) {
    errors.push('authority.rules-tableau-requis');
    return;
  }
  const policies = ['allow', 'on_request', 'ask_first', 'hand_off'];
  for (const rule of authority.rules) {
    if (!rule || !policies.includes(rule.policy)) errors.push('authority.regle-politique-inconnue');
  }
}

function checkDurability(config, errors) {
  const durability = config.durability;
  if (!isPlainObject(durability)) return errors.push('durability-requise');
  if (durability.recoveryPolicy !== 'reconcile') errors.push('durability.recoveryPolicy-invalide');
  if (durability.ambiguousOutcome !== 'escalate') errors.push('durability.ambiguousOutcome-invalide');
}

function checkRetention(config, errors) {
  const retention = config.retention;
  if (!isPlainObject(retention)) return errors.push('retention-requise');
  for (const field of ['artifactsDays', 'evidenceDays', 'quarantineDays']) {
    if (!Number.isSafeInteger(retention[field]) || retention[field] < 0) errors.push(`retention.${field}-invalide`);
  }
}

function checkExternalAuthority(config, errors) {
  if (!isPlainObject(config.publication) || config.publication.enabled !== false) {
    errors.push('publication-interdite-lot0');
  }
  if (!isPlainObject(config.merge) || config.merge.enabled !== false) errors.push('fusion-interdite-lot0');
}

function checkDaemonStewardship(config, errors) {
  const policy = config.daemonStewardship;
  if (!isPlainObject(policy)) return errors.push('daemonStewardship-requis');
  if (typeof policy.enabled !== 'boolean') errors.push('daemonStewardship.enabled-booleen-requis');
  if (typeof policy.autoEnqueue !== 'boolean') errors.push('daemonStewardship.autoEnqueue-booleen-requis');
  if (typeof policy.requireLiveDaemon !== 'boolean') errors.push('daemonStewardship.requireLiveDaemon-booleen-requis');
  if (!Number.isSafeInteger(policy.maxOpenTasks) || policy.maxOpenTasks < 0 || policy.maxOpenTasks > 20) {
    errors.push('daemonStewardship.maxOpenTasks-invalide');
  }
  const allowed = ['REPAIRABLE', 'CAUSALLY_SUPPORTED', 'REPRODUCED'];
  if (!Array.isArray(policy.eligibleStatuses) || policy.eligibleStatuses.some((status) => !allowed.includes(status))) {
    errors.push('daemonStewardship.eligibleStatuses-invalides');
  }
}

function migrateProjectConfig(input) {
  if (!isPlainObject(input)) throw new Error('configuration-legacy-invalide');
  const version = input.version === undefined ? LEGACY_CONFIG_VERSION : input.version;
  if (version === CONFIG_VERSION) return { ...input };
  if (version !== LEGACY_CONFIG_VERSION) throw new Error('version-migration-inconnue');
  if (input.allowPush === true || input.allowMerge === true) throw new Error('autorite-externe-legacy-interdite');
  const foundation = defaultConfig();
  const safeDefaults = { ...foundation };
  delete safeDefaults.authority;
  return { ...safeDefaults, ...input, version: CONFIG_VERSION, allowPush: false, allowMerge: false,
    durability: foundation.durability, retention: foundation.retention,
    publication: foundation.publication, merge: foundation.merge };
}

function validateProjectConfig(input) {
  const config = Object.assign(defaultConfig(), input || {});
  config.daemonStewardship = {
    ...defaultConfig().daemonStewardship, ...(input?.daemonStewardship || {})
  };
  if (input && input.branch && !input.authority) config.authority.branches = [config.branch];
  const errors = [];
  checkCore(config, errors);
  checkAuthority(config, errors);
  checkExecution(config, errors);
  checkDurability(config, errors);
  checkRetention(config, errors);
  checkExternalAuthority(config, errors);
  checkDaemonStewardship(config, errors);
  validateExecutionConfig(config, errors);
  return { ok: errors.length === 0, errors, config };
}

function checkCore(config, errors) {
  if (config.version !== CONFIG_VERSION) errors.push('version-inconnue');
  if (!config.branch || typeof config.branch !== 'string') errors.push('branch-requise');
  if (!isPlainObject(config.budgets)) errors.push('budgets-requis');
  else checkBudgets(config, errors);
  if (!isPlainObject(config.memory)) errors.push('memory-requis');
  else checkMemory(config, errors);
  if (config.allowPush === true) errors.push('allowPush-interdit-par-defaut');
  if (config.allowMerge === true) errors.push('allowMerge-interdit-par-defaut');
}

module.exports = { CONFIG_VERSION, LEGACY_CONFIG_VERSION, DEFAULT_BRANCH,
  defaultConfig, migrateProjectConfig, validateProjectConfig };
