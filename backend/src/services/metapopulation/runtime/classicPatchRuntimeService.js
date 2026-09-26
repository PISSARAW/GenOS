'use strict';
const store = require('../metapopulationStore');
const recolonizationService = require('../patches/recolonizationService');
const { startColonizationTrial } = recolonizationService;

const EXTINCTION_TO_RECOLONIZATION_GAP_MS = 5000;

async function detectExtinctionCycle(session, options) {
  const now = options.now ? Number(new Date(options.now)) : Date.now();
  const extinctDemes = session.demes.filter((d) => d.status === 'COLLAPSED');
  const vacantPatches = session.patches.filter(
    (p) => p.status === 'VACANT'
      && (!p.extinguishedAt
        || now - Number(new Date(p.extinguishedAt)) > EXTINCTION_TO_RECOLONIZATION_GAP_MS)
  );
  return { extinctDemes, vacantPatches, hasGap: extinctDemes.length > 0 && vacantPatches.length > 0 };
}

async function findCandidateLineages(session, extinctDeme, options) {
  const activeDemes = session.demes.filter(
    (d) => d.status === 'ACTIVE' && d.demeId !== extinctDeme.demeId && d.lineage && d.lineage.founders
  );
  const candidates = activeDemes.map((d) => ({
    lineageId: d.lineage.founders[0] || d.demeId,
    patchIds: [d.patchId],
    sourceDemeId: d.demeId,
    fitness: Number(d.fitness?.score ?? 0.5),
  }));
  return candidates.length >= 2 ? candidates : [];
}

async function planRecolonizationLoop(session, extinctDeme, options) {
  const candidateLineages = await findCandidateLineages(session, extinctDeme, options);
  if (candidateLineages.length < 2) return null;
  const vacantPatch = session.patches.find(
    (p) => p.status === 'VACANT' && p.patchId === extinctDeme.patchId
  );
  if (!vacantPatch) return null;
  const result = await recolonizationService.planRecolonization(
    {
      metapopulationId: session.metapopulationId,
      candidateLineages,
      founderLimit: Number(options.founderLimit || 4),
    },
    options
  );
  const patchPlan = result.patches.find((p) => p.patchId === vacantPatch.patchId);
  if (!patchPlan || patchPlan.founders.length < result.minimumLineages) return null;
  return {
    patchId: vacantPatch.patchId,
    founders: patchPlan.founders,
    minimumLineages: result.minimumLineages,
  };
}

async function executeRecolonization(session, plan, options) {
  const colonizationId = options.rustEvolution?.() || require('crypto').randomUUID();
  const result = await startColonizationTrial(
    {
      metapopulationId: session.metapopulationId,
      patchId: plan.patchId,
      founders: plan.founders.map((f) => ({ lineageId: f.lineageId || f, patchIds: f.patchIds || [plan.patchId] })),
      colonizationId,
      actor: 'classic_patch_runtime',
      occurredAt: new Date().toISOString(),
      provenance: { source: 'classic_patch_runtime', variant: 'classic_patch' },
    },
    options
  );
  return { colonizationId, status: result.status, patchId: plan.patchId, founders: plan.founders };
}

async function verifyRecolonizationOutcome(colonizationId, options) {
  const rows = await options.db.all(
    `SELECT status, founder_lineages_json FROM metapopulation_colonizations WHERE colonization_id = ?`,
    colonizationId
  );
  const row = rows[0];
  if (!row) return { found: false };
  return {
    found: true,
    status: row.status,
    viable: row.status === 'ACCEPTED',
    lineageCount: JSON.parse(row.founder_lineages_json || '[]').length,
  };
}

async function runClassicPatchCycle(session, input, options) {
  const { extinctDemes, vacantPatches, hasGap } = await detectExtinctionCycle(session, options);
  if (!hasGap) return { cycled: false, reason: 'NO_EXTINCT_VACANT_PAIR' };
  const results = [];
  for (const deme of extinctDemes) {
    const plan = await planRecolonizationLoop(session, deme, options);
    if (!plan) {
      results.push({ demeId: deme.demeId, action: 'NO_FOUNDER_SET', reason: 'INSUFFICIENT_LINEAGES' });
      continue;
    }
    const recol = await executeRecolonization(session, plan, options);
    results.push({
      demeId: deme.demeId,
      action: 'START_RECOLONIZATION_TRIAL',
      colonizationId: recol.colonizationId,
      status: recol.status,
      patchId: recol.patchId,
    });
  }
  return { cycled: true, results, extinctDemeCount: extinctDemes.length };
}

module.exports = {
  detectExtinctionCycle,
  findCandidateLineages,
  planRecolonizationLoop,
  executeRecolonization,
  verifyRecolonizationOutcome,
  runClassicPatchCycle,
};
