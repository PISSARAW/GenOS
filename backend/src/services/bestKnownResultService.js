'use strict';

const { randomUUID } = require('crypto');
const { migrateRequestMemory } = require('../db/migrations/migrateRequestMemory');

async function ensureTables(db) {
  await migrateRequestMemory(db);
}

async function getProblem(db, semanticId) {
  await ensureTables(db);
  return db.get('SELECT * FROM request_problems WHERE semantic_id = ?', semanticId).catch(() => null);
}

async function getChampion(db, semanticId) {
  const problem = await getProblem(db, semanticId);
  if (!problem || !problem.champion_result_id) return { problem, champion: null };
  const champion = await db.get('SELECT * FROM request_results WHERE id = ?', problem.champion_result_id).catch(() => null);
  return { problem, champion };
}

function isExpired(row) {
  if (!row || !row.expires_at) return false;
  return new Date(row.expires_at).getTime() <= Date.now();
}

function depsChanged(storedJson, currentDeps) {
  const stored = parseJson(storedJson);
  if (!currentDeps || Object.keys(currentDeps).length === 0) return false;
  return Object.keys(currentDeps).some((k) => String(stored[k] || '') !== String(currentDeps[k]));
}

function parseJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch (_) {
    return {};
  }
}

async function lookupReusable(db, input) {
  const found = await getChampion(db, input.semanticId);
  if (!found.champion) return { hit: false, problem: found.problem };
  if (found.champion.status !== 'VERIFIED') {
    return { hit: false, problem: found.problem, champion: found.champion, reason: 'status-not-reusable' };
  }
  if (isExpired(found.champion)) {
    await markStale(db, found.champion.id);
    return { hit: false, problem: found.problem, champion: found.champion, reason: 'expired' };
  }
  if (depsChanged(found.champion.dependencies_json, input.dependencies)) {
    await markStale(db, found.champion.id);
    return { hit: false, problem: found.problem, champion: found.champion, reason: 'deps-changed' };
  }
  return { hit: true, problem: found.problem, champion: found.champion };
}

async function markStale(db, id) {
  await ensureTables(db);
  await db.run("UPDATE request_results SET status = 'STALE', updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);
}

async function storeCandidate(db, input) {
  await ensureTables(db);
  const existing = await getProblem(db, input.semanticId);
  const version = await nextVersion(db, input.semanticId);
  const id = `res_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (!existing) {
    await db.run(
      'INSERT INTO request_problems (semantic_id, normalized_intent, request_class, profile_json, champion_result_id) VALUES (?, ?, ?, ?, ?)',
      input.semanticId, input.normalizedIntent, input.requestClass, input.profileJson, id
    );
  }
  await db.run(
    `INSERT INTO request_results (id, semantic_id, result_version, status, content_json, evidence_json,
      uncertainty_json, dependencies_json, execution_json, validity_horizon_ms, expires_at, utility, cost_json, supersedes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.semanticId, version, input.status, input.contentJson, input.evidenceJson,
    input.uncertaintyJson, input.dependenciesJson, input.executionJson, input.validityHorizonMs,
    input.expiresAt, input.utility, input.costJson, input.supersedes
  );
  if (input.promote !== false) {
    await promoteChampion(db, input.semanticId, id);
  }
  return { id, version };
}

async function nextVersion(db, semanticId) {
  const row = await db.get('SELECT MAX(result_version) AS m FROM request_results WHERE semantic_id = ?', semanticId).catch(() => null);
  return Number(row && row.m ? row.m : 0) + 1;
}

async function promoteChampion(db, semanticId, id) {
  const current = await getChampion(db, semanticId);
  if (current.champion && current.champion.id !== id) {
    await db.run("UPDATE request_results SET status = 'SUPERSEDED' WHERE id = ?", current.champion.id);
  }
  await db.run('UPDATE request_problems SET champion_result_id = ?, updated_at = CURRENT_TIMESTAMP WHERE semantic_id = ?', id, semanticId);
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
