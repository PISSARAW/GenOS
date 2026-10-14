'use strict';

const { createHash, randomUUID } = require('crypto');
const { isDeepStrictEqual } = require('node:util');
const { migrateRequestMemory } = require('../db/migrations/migrateRequestMemory');

async function ensureTables(db) {
  await migrateRequestMemory(db);
}

async function getProblem(db, semanticId) {
  await ensureTables(db);
  return db.get('SELECT * FROM request_problems WHERE semantic_id = ?', semanticId).catch(() => null);
}

function scopedSemanticId(semanticId, scopeId) {
  const scope = String(scopeId || '').trim();
  if (!scope) throw Object.assign(new Error('A workspace or tenant scope is required for request memory.'), { code: 'RESULT_SCOPE_REQUIRED' });
  const key = `${scope}\0${String(semanticId || '')}`;
  return `scope_${createHash('sha256').update(key).digest('hex')}`;
}

async function getChampion(db, semanticId, scopeId) {
  const scopedId = scopedSemanticId(semanticId, scopeId);
  const problem = await getProblem(db, scopedId);
  if (!problem || !problem.champion_result_id) return { problem, champion: null };
  const champion = await db.get('SELECT * FROM request_results WHERE id = ?', problem.champion_result_id).catch(() => null);
  return { problem, champion };
}

function isExpired(row) {
  if (!row || !row.expires_at) return false;
  return new Date(row.expires_at).getTime() <= Date.now();
}

function depsChanged(storedJson, currentDeps) {
  const stored = parseDependencyMap(storedJson);
  if (!stored || !isDependencyMap(currentDeps)) return true;
  const storedKeys = Object.keys(stored).sort();
  const currentKeys = Object.keys(currentDeps).sort();
  return storedKeys.length !== currentKeys.length
    || storedKeys.some((key, index) => key !== currentKeys[index]
      || !isDeepStrictEqual(stored[key], currentDeps[key]));
}

function parseDependencyMap(text) {
  try {
    const value = JSON.parse(text || '{}');
    return isDependencyMap(value) ? value : null;
  } catch (_) {
    return null;
  }
}

function isDependencyMap(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function dependencyFailureReason(champion, input) {
  const stored = parseDependencyMap(champion.dependencies_json);
  if (!stored || (input.dependencies !== undefined && !isDependencyMap(input.dependencies))) return 'dependencies-invalid';
  if (Object.keys(stored).length > 0 && !isDependencyMap(input.dependencies)) return 'dependencies-unavailable';
  const current = isDependencyMap(input.dependencies) ? input.dependencies : {};
  return depsChanged(champion.dependencies_json, current) ? 'deps-changed' : null;
}

async function dependencyFailure(db, found, input) {
  const reason = dependencyFailureReason(found.champion, input);
  if (!reason) return null;
  if (reason === 'deps-changed') await markStale(db, found.champion.id);
  return { hit: false, problem: found.problem, champion: found.champion, reason };
}

async function lookupReusable(db, input) {
  const found = await getChampion(db, input.semanticId, input.scopeId);
  if (!found.champion) return { hit: false, problem: found.problem };
  if (found.champion.status !== 'VERIFIED') {
    return { hit: false, problem: found.problem, champion: found.champion, reason: 'status-not-reusable' };
  }
  if (isExpired(found.champion)) {
    await markStale(db, found.champion.id);
    return { hit: false, problem: found.problem, champion: found.champion, reason: 'expired' };
  }
  const dependencyMiss = await dependencyFailure(db, found, input);
  if (dependencyMiss) return dependencyMiss;
  return { hit: true, problem: found.problem, champion: found.champion };
}

async function markStale(db, id) {
  await ensureTables(db);
  await db.run("UPDATE request_results SET status = 'STALE', updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);
}

async function storeCandidate(db, input) {
  await ensureTables(db);
  const scopedId = scopedSemanticId(input.semanticId, input.scopeId);
  const existing = await getProblem(db, scopedId);
  const version = await nextVersion(db, scopedId);
  const id = `res_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const shouldPromote = input.promote !== false && input.status === 'VERIFIED';
  if (!existing) {
    await db.run(
      'INSERT INTO request_problems (semantic_id, normalized_intent, request_class, profile_json, champion_result_id) VALUES (?, ?, ?, ?, ?)',
      scopedId, input.normalizedIntent, input.requestClass, input.profileJson, shouldPromote ? id : null
    );
  }
  await db.run(
    `INSERT INTO request_results (id, semantic_id, result_version, status, content_json, evidence_json,
      uncertainty_json, dependencies_json, execution_json, validity_horizon_ms, expires_at, utility, cost_json, supersedes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, scopedId, version, input.status, input.contentJson, input.evidenceJson,
    input.uncertaintyJson, input.dependenciesJson, input.executionJson, input.validityHorizonMs,
    input.expiresAt, input.utility, input.costJson, input.supersedes
  );
  if (shouldPromote) {
    await promoteChampion(db, { semanticId: input.semanticId, id, scopeId: input.scopeId });
  }
  return { id, version };
}

async function nextVersion(db, semanticId) {
  const row = await db.get('SELECT MAX(result_version) AS m FROM request_results WHERE semantic_id = ?', semanticId).catch(() => null);
  return Number(row && row.m ? row.m : 0) + 1;
}

async function promoteChampion(db, input) {
  await ensureTables(db);
  const scopedId = scopedSemanticId(input.semanticId, input.scopeId);
  const candidate = await db.get('SELECT semantic_id, status FROM request_results WHERE id = ?', input.id);
  if (!candidate || candidate.semantic_id !== scopedId || candidate.status !== 'VERIFIED') {
    throw Object.assign(new Error('Only a verified result for this problem can become champion.'), { code: 'RESULT_PROMOTION_BLOCKED' });
  }
  const current = await getChampion(db, input.semanticId, input.scopeId);
  if (current.champion && current.champion.id !== input.id) {
    await db.run("UPDATE request_results SET status = 'SUPERSEDED' WHERE id = ? AND status = 'VERIFIED'", current.champion.id);
  }
  await db.run('UPDATE request_problems SET champion_result_id = ?, updated_at = CURRENT_TIMESTAMP WHERE semantic_id = ?', input.id, scopedId);
}

async function refuteResult(db, id) {
  await db.run("UPDATE request_results SET status = 'REFUTED' WHERE id = ?", id);
}

function expiryFor(profile) {
  if (profile && profile.temporal && profile.temporal.freshness_required) {
    return { horizonMs: 6 * 3600 * 1000, expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString() };
  }
  return { horizonMs: null, expiresAt: null };
}

module.exports = {
  ensureTables,
  getProblem,
  getChampion,
  lookupReusable,
  markStale,
  storeCandidate,
  promoteChampion,
  refuteResult,
  expiryFor,
};
