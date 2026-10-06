'use strict';

const recoveryStore = require('./demeRecoveryStore');

function assessExtinction(input = {}) {
  const workers = Array.isArray(input.workers) ? input.workers : [];
  const alive = workers.filter((worker) => worker?.status === 'ACTIVE' || worker?.status === 'ALIVE');
  const unavailable = ['DEAD', 'CRASHED', 'FAILED', 'TERMINATED', 'UNAVAILABLE', 'STOPPED'];
  const unknown = workers.some((worker) => !unavailable.includes(worker?.status));
  const localFunctions = Array.isArray(input.localFunctions) ? input.localFunctions : [];
  const viable = localFunctions.some((item) => item?.viable === true);
  const unmeasured = !Array.isArray(input.localFunctions) || localFunctions.some((item) => typeof item?.viable !== 'boolean');
  const status = extinctionStatus({ viable, active: alive.length,
    uncertain: unknown || unmeasured || workers.length === 0 });
  return { status, activeWorkers: alive.length, viableFunctions: viable,
    evidenceRequired: status === 'UNKNOWN' ? ['worker_liveness', 'local_function_viability'] : [] };
}

function extinctionStatus(assessment) {
  if (assessment.viable || assessment.active > 0) return 'NOT_EXTINCT';
  return assessment.uncertain ? 'UNKNOWN' : 'EXTINCT';
}

async function reportDemeFailure(input = {}, options = {}) {
  const assessment = assessExtinction(input.evidence);
  if (assessment.status !== 'EXTINCT') return { ...assessment, recorded: false };
  requireContext(input, options);
  const recorded = await recoveryStore.recordExtinction(options.db, {
    metapopulationId: input.metapopulationId, demeId: input.demeId,
    reason: String(input.reason || 'all_workers_unavailable'),
    provenance: input.provenance || {}, actor: input.actor, occurredAt: input.occurredAt
  });
  return { ...assessment, recorded: true, extinction: recorded };
}

async function listDemeExtinctions(input = {}, options = {}) {
  requireContext(input, options);
  return recoveryStore.listExtinctions(options.db, input.metapopulationId, input.demeId);
}

async function planDemeRecovery(input = {}, options = {}) {
  const history = await listDemeExtinctions(input, options);
  const cause = String(input.reason || 'all_workers_unavailable');
  const failed = failedLineages(history, cause);
  const candidates = eligibleLineages(input.candidateLineages, failed);
  return { patchId: history.at(-1)?.patchId || input.patchId || null, cause,
    candidates: candidates.slice(0, founderLimit(input.founderLimit)),
    excludedLineages: [...failed], recoveryEvidence: {
      cryptobiosisRefs: input.cryptobiosisRefs || [], snapshotRefs: input.snapshotRefs || [],
      fossilRefs: input.fossilRefs || []
    }, requiresLocalTrial: true };
}

function failedLineages(history, cause) {
  return new Set(history.filter((item) => item.reason === cause)
    .flatMap((item) => item.provenance?.failedLineages || []));
}

function eligibleLineages(lineages, failed) {
  return (Array.isArray(lineages) ? lineages : [])
    .filter((lineage) => lineage?.lineageId && !failed.has(lineage.lineageId));
}

function founderLimit(value) { return Math.max(1, Number(value) || 3); }

function requireContext(input, options) {
  if (!options.db || !input.metapopulationId || !input.demeId) {
    throw Object.assign(new Error('Database, metapopulation and deme are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  }
}

module.exports = { assessExtinction, reportDemeFailure, listDemeExtinctions, planDemeRecovery };
