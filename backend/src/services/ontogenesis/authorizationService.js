'use strict';

/**
 * Autorisation préalable contre vérification par gates (ADR 0235 §8).
 * Autoriser n'est pas prouver : hors périmètre → demande d'approbation.
 */

function isBranchAllowed(authority, branch) {
  const branches = (authority && authority.branches) || [];
  return branches.includes(branch) || branches.includes('*');
}

function isPathAllowed(authority, path) {
  const paths = (authority && authority.paths) || [];
  if (paths.includes('*')) return true;
  return paths.some((prefix) => isPrefix(prefix, path));
}

function isPrefix(prefix, path) {
  return String(path).startsWith(prefix);
}

function checkPushMerge(action) {
  if (action.scope === 'push') return { allowed: false, reason: 'push-non-autorise' };
  if (action.scope === 'merge') return { allowed: false, reason: 'fusion-non-autorisee' };
  return null;
}

function checkScopeFlag(authority, action) {
  if (action.scope === 'edit' && authority.allowEdit !== true) return 'edition-non-autorisee';
  if (action.scope === 'test' && authority.allowTests !== true) return 'tests-non-autorises';
  if (action.scope === 'commit' && authority.allowCommit !== true) return 'commit-non-autorise';
  return null;
}

function isActionAllowed(config, action) {
  const denied = checkPushMerge(action);
  if (denied) return denied;
  const authority = (config && config.authority) || {};
  if (!isBranchAllowed(authority, action.branch)) return deniedBranch();
  if (action.path && !isPathAllowed(authority, action.path)) return deniedPath();
  const flag = checkScopeFlag(authority, action);
  if (flag) return { allowed: false, reason: flag };
  return { allowed: true };
}

function deniedBranch() {
  return { allowed: false, reason: 'branche-hors-perimetre' };
}

function deniedPath() {
  return { allowed: false, reason: 'chemin-hors-perimetre' };
}

module.exports = { isActionAllowed, isBranchAllowed, isPathAllowed };
