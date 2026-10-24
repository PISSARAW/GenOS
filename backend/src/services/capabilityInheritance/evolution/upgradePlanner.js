'use strict';

const { resolveProjectInheritance } = require('../resolver/compatibilityResolver');
const VERSION_PATTERN = new RegExp('^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$');
const NUMERIC_IDENTIFIER = /^\d+$/;

function planUpgrade(input) {
  assertManifestMatchesInstallation(input.manifest, input.currentLockfile);
  const manifest = selectCandidateManifest(input);
  const lockfile = resolveProjectInheritance({ manifest, registry: input.registry,
    projectAuthority: input.projectAuthority, resolvedAt: input.resolvedAt });
  const changes = compareGraphs(input.currentLockfile, lockfile);
  if (changes.some((entry) => entry.toVersion === null)) {
    const error = new Error('GCI upgrade plans cannot remove installed capabilities');
    error.code = 'GCI_UPGRADE_REMOVAL_DENIED';
    throw error;
  }
  return Object.freeze({ schema: 'genos.gci.upgrade-plan/v1',
    status: changes.length ? 'resolved' : 'no_change', projectId: manifest.project.id,
    environment: manifest.project.environment, sourceGraphDigest: input.currentLockfile.graphDigest,
    candidateGraphDigest: lockfile.graphDigest, changes, manifest, lockfile,
    requiresIndependentVerification: true, automaticMerge: false, sideEffects: [] });
}

function assertManifestMatchesInstallation(manifest, lockfile) {
  const matches = manifest.project.id === lockfile.projectId
    && manifest.project.environment === lockfile.environment
    && manifest.inherit.every((entry) => lockfile.capabilities.some((installed) =>
      installed.capabilityId === entry.capability && installed.version === entry.version && installed.mode === entry.mode));
  if (!matches) {
    const error = new Error('GCI manifest no longer matches the installed lockfile');
    error.code = 'GCI_UPGRADE_SOURCE_STALE';
    throw error;
  }
}

function selectCandidateManifest(input) {
  const exports = input.registry.listExports();
  const inherit = input.manifest.inherit.map((entry) => ({ ...entry,
    version: latestVersion({ exports, capabilityId: entry.capability, currentVersion: entry.version, mode: entry.mode }) }));
  return { ...input.manifest, inherit };
}

function latestVersion(input) {
  const versions = input.exports.filter((entry) => entry.capabilityId === input.capabilityId
    && entry.exportModes.includes(input.mode) && compareVersions(entry.version, input.currentVersion) > 0)
    .map((entry) => entry.version).sort(compareVersions);
  return versions[versions.length - 1] || input.currentVersion;
}

function compareGraphs(current, candidate) {
  const oldEntries = new Map(current.capabilities.map((entry) => [entry.capabilityId, entry]));
  const newEntries = new Map(candidate.capabilities.map((entry) => [entry.capabilityId, entry]));
  const ids = [...new Set([...oldEntries.keys(), ...newEntries.keys()])].sort();
  return ids.filter((id) => !sameEntry(oldEntries.get(id), newEntries.get(id)))
    .map((id) => changeEntry(id, oldEntries.get(id), newEntries.get(id)));
}

function sameEntry(oldEntry, newEntry) {
  return Boolean(oldEntry && newEntry && oldEntry.version === newEntry.version
    && oldEntry.implementationDigest === newEntry.implementationDigest && oldEntry.mode === newEntry.mode
    && JSON.stringify(oldEntry.effectiveAuthority) === JSON.stringify(newEntry.effectiveAuthority));
}

function changeEntry(capabilityId, oldEntry, newEntry) {
  return { capabilityId, fromVersion: oldEntry?.version || null, toVersion: newEntry?.version || null,
    fromDigest: oldEntry?.implementationDigest || null, toDigest: newEntry?.implementationDigest || null,
    authorityChanged: JSON.stringify(oldEntry?.effectiveAuthority || []) !== JSON.stringify(newEntry?.effectiveAuthority || []) };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  return comparePrerelease(a.pre, b.pre);
}

function comparePrerelease(left, right) {
  if (!left.length || !right.length) return left.length === right.length ? 0 : left.length ? -1 : 1;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const result = compareIdentifier(left[index], right[index]);
    if (result) return result;
  }
  return Math.sign(left.length - right.length);
}

function compareIdentifier(left, right) {
  const leftNumeric = NUMERIC_IDENTIFIER.test(left);
  const rightNumeric = NUMERIC_IDENTIFIER.test(right);
  if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right) ? 1 : BigInt(left) < BigInt(right) ? -1 : 0;
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value));
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  if (core.some((item) => !Number.isSafeInteger(item))) return null;
  const pre = match[4] ? match[4].split('.') : [];
  if (pre.some((item) => !item || (NUMERIC_IDENTIFIER.test(item) && item.length > 1 && item.startsWith('0')))) return null;
  return { core, pre };
}

module.exports = { planUpgrade, selectCandidateManifest, compareVersions };
