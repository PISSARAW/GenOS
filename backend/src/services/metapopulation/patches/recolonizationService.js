'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const { migrateMetapopulation } = require('../../../db/migrations/migrateMetapopulation');
const patchService = require('./patchService');
const demeService = require('../demes/demeService');

async function planRecolonization(input = {}, options = {}) {
  requireContext(input, options);
  const patches = await patchService.listPatches({ ...options, metapopulationId: input.metapopulationId });
  const vacant = patches.filter((patch) => ['VACANT', 'AVAILABLE'].includes(patch.status));
  const founders = uniqueFounders(input.candidateLineages, await priorFailures(options.db, input))
    .slice(0, founderLimit(input.founderLimit));
  return { patches: vacant.map((patch) => ({ patchId: patch.patchId, quality: patch.quality,
    founders: founders.filter((item) => compatibleWithPatch(item, patch)) })),
  minimumLineages: 2, requiresLocalTrial: true };
}

async function priorFailures(db, input) {
  await migrateMetapopulation(db);
  const rows = await db.all(`SELECT founder_lineages_json FROM metapopulation_colonizations
    WHERE metapopulation_id = ? AND patch_id = ? AND status = 'FAILED'`, input.metapopulationId, input.patchId);
  return new Set([...input.failedLineages || [], ...rows.flatMap((row) => parseLineages(row.founder_lineages_json))]);
}

function parseLineages(value) { try { return JSON.parse(value || '[]'); } catch (_) { return []; } }

async function startColonizationTrial(input = {}, options = {}) {
  requireContext(input, options);
  const founders = uniqueFounders(input.founders, new Set());
  if (founders.length < 2) throw colonizationError('METAPOPULATION_FOUNDER_SET_INSUFFICIENT', 'Two distinct founder lineages are required.');
  await migrateMetapopulation(options.db);
  const colonizationId = input.colonizationId || randomUUID();
  await withTransaction(options.db, async () => {
    await requireVacantPatch(options.db, input.metapopulationId, input.patchId);
    const pending = await options.db.get(`SELECT colonization_id FROM metapopulation_colonizations
      WHERE metapopulation_id = ? AND patch_id = ? AND status IN ('IN_TRIAL', 'COMPLETING')`, input.metapopulationId, input.patchId);
    if (pending) throw colonizationError('METAPOPULATION_COLONIZATION_PENDING', 'Patch already has a pending local trial.');
    await insertTrial(options.db, { input, founders, colonizationId });
  });
  return { colonizationId, patchId: input.patchId, status: 'IN_TRIAL', founders };
}

async function finishColonizationTrial(input = {}, options = {}) {
  requireContext(input, options);
  await migrateMetapopulation(options.db);
  const viable = input.evidence?.viable === true && Number.isFinite(Number(input.evidence?.fitness));
  return withTransaction(options.db, async () => {
    const attempt = await pendingAttempt(options.db, input);
    if (!viable) return recordFailure(attempt, input, options);
    await requireVacantPatch(options.db, input.metapopulationId, attempt.patch_id);
    const deme = await demeService.createDeme({ demeId: input.demeId || randomUUID(), patchId: attempt.patch_id,
      status: 'FOUNDING', lineage: { founders: JSON.parse(attempt.founder_lineages_json) }, fitness: { local: Number(input.evidence.fitness) } },
    { ...options, metapopulationId: input.metapopulationId });
    await options.db.run(`UPDATE metapopulation_colonizations SET status = 'ACCEPTED', deme_id = ?, evidence_json = ?, completed_at = ?
      WHERE colonization_id = ? AND status = 'IN_TRIAL'`, deme.demeId, JSON.stringify(input.evidence), new Date().toISOString(), input.colonizationId);
    return { colonizationId: input.colonizationId, status: 'ACCEPTED', deme };
  });
}

async function requireVacantPatch(db, metapopulationId, patchId) {
  const patch = await db.get('SELECT status FROM metapopulation_patches WHERE metapopulation_id = ? AND patch_id = ?', metapopulationId, patchId);
  if (!patch || !['VACANT', 'AVAILABLE'].includes(patch.status)) throw colonizationError('METAPOPULATION_PATCH_NOT_COLONIZABLE', 'Patch is not vacant.');
}

async function insertTrial(db, trial) {
  const { input, founders, colonizationId } = trial;
  await db.run(`INSERT INTO metapopulation_colonizations
    (colonization_id, metapopulation_id, patch_id, status, founder_lineages_json, evidence_json, provenance_json, actor, started_at)
    VALUES (?, ?, ?, 'IN_TRIAL', ?, '{}', ?, ?, ?)`, colonizationId, input.metapopulationId, input.patchId,
  JSON.stringify(founders.map((item) => item.lineageId)), JSON.stringify(input.provenance || {}),
  input.actor || 'metapopulation-runtime', input.occurredAt || new Date().toISOString());
}

async function pendingAttempt(db, input) {
  const attempt = await db.get('SELECT * FROM metapopulation_colonizations WHERE metapopulation_id = ? AND colonization_id = ?', input.metapopulationId, input.colonizationId);
  if (!attempt || attempt.status !== 'IN_TRIAL') throw colonizationError('METAPOPULATION_COLONIZATION_NOT_PENDING', 'Colonization trial is not pending.');
  return attempt;
}

async function recordFailure(attempt, input, options) {
  const updated = await options.db.run(`UPDATE metapopulation_colonizations SET status = 'FAILED', evidence_json = ?, completed_at = ?
    WHERE colonization_id = ? AND status = 'IN_TRIAL'`, JSON.stringify(input.evidence || {}),
  input.occurredAt || new Date().toISOString(), input.colonizationId);
  if (updated.changes !== 1) throw colonizationError('METAPOPULATION_COLONIZATION_CONFLICT', 'Colonization trial was already completed.');
  return { colonizationId: attempt.colonization_id, patchId: attempt.patch_id, status: 'FAILED', patchRemainsVacant: true };
}

function uniqueFounders(items, excluded) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const id = item?.lineageId;
    if (!id || excluded.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function compatibleWithPatch(founder, patch) { return !Array.isArray(founder.patchIds) || founder.patchIds.includes(patch.patchId); }
function founderLimit(value) { return Math.max(2, Math.min(8, Number(value) || 4)); }
function requireContext(input, options) {
  if (!options.db || !input.metapopulationId) throw colonizationError('METAPOPULATION_CONTEXT_REQUIRED', 'Database and metapopulation are required.');
}
function colonizationError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { planRecolonization, startColonizationTrial, finishColonizationTrial };
