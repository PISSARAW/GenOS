'use strict';
const { randomUUID } = require('crypto');
const { selectCandidates } = require('./migrationPolicyService');
const migrationStore = require('./migrationStore');

async function planRescueMigration(input, options = {}) {
  if (!options.db || !input.metapopulationId || !input.targetDemeId) throw Object.assign(new Error('Database, metapopulation and target deme are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  const attemptsUsed = await migrationStore.countRescueAttempts(options.db, input.metapopulationId, input.targetDemeId);
  return planRescue({ ...input, attemptsUsed });
}

function planRescue(input) {
  const maximum = Number.isSafeInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 3;
  const attemptsLeft = Math.max(0, maximum - Number(input.attemptsUsed || 0));
  if (attemptsLeft === 0) return { allowed: false, reason: 'ATTEMPT_LIMIT', trials: [] };
  const maxFitness = Number(input.maxTargetFitness ?? 0.35);
  if (Number(input.targetFitness) > maxFitness) return { allowed: false, reason: 'TARGET_NOT_AT_RISK', trials: [] };
  const candidates = eligibleRescuers(input);
  const limit = Math.min(attemptsLeft, Number(input.maxTrials || 1));
  const selected = selectCandidates(candidates, { policy: 'rescue', targetDemeId: input.targetDemeId, limit });
  return { allowed: selected.length > 0, reason: selected.length ? null : 'NO_COMPATIBLE_SOURCE',
    targetDemeId: input.targetDemeId, baselineFitness: input.targetFitness,
    trials: selected.map((candidate) => ({ trialId: randomUUID(), propagule: { ...candidate, migrationReason: 'rescue' } })) };
}

function eligibleRescuers(input) {
  const floor = Number(input.minimumCompatibility ?? 0.6);
  return (Array.isArray(input.candidates) ? input.candidates : []).filter((candidate) =>
    candidate.targetDemeId === input.targetDemeId && Number(candidate.compatibility) >= floor &&
    Number(candidate.targetFitness) <= Number(input.maxTargetFitness ?? 0.35));
}

function evaluateRescueOutcome(input) {
  const baseline = Number(input.baselineFitness);
  const after = Number(input.fitnessAfter);
  if (!Number.isFinite(baseline) || !Number.isFinite(after)) throw Object.assign(new Error('Rescue fitness measurements are required.'), { code: 'METAPOPULATION_RESCUE_EVIDENCE_INVALID' });
  const regressionLimit = Number(input.allowedRegression || 0);
  const rollback = after < baseline - regressionLimit;
  return { trialId: input.trialId, baselineFitness: baseline, fitnessAfter: after,
    benefit: Number((after - baseline).toFixed(4)), rollback,
    corridorPenalty: rollback ? Number(input.corridorPenalty ?? 0.15) : 0 };
}

module.exports = { planRescue, planRescueMigration, evaluateRescueOutcome };
