'use strict';

const { appendEvent } = require('./gvxDevelopmentLedger');

function validate(options) {
  if (!Array.isArray(options?.candidates) || !options.candidates.length || options.candidates.length > 8) throw new Error('lineage-search-arm-limit');
  if (typeof options.createCandidateBranch !== 'function' || typeof options.evaluate !== 'function') throw new Error('lineage-search-adapters-required');
  if (!Number.isFinite(options.maxCost) || options.maxCost <= 0 || !Number.isInteger(options.maxSeconds) || options.maxSeconds <= 0) throw new Error('lineage-search-budget-invalid');
}

async function evaluateArm(args) {
  const { options, candidate, index, remainingCost } = args;
  const branch = await options.createCandidateBranch({ candidate, index, parentHash: candidate.parentHash,
    maxCost: Math.min(remainingCost, candidate.maxCost || remainingCost), maxSeconds: Math.min(options.maxSeconds, candidate.maxSeconds || options.maxSeconds) });
  if (!branch?.branchId || branch.production === true) throw new Error('isolated-candidate-branch-required');
  const outcome = await options.evaluate({ branch, candidate, verifierProfile: candidate.verifierProfile,
    maxCost: branch.maxCost, maxSeconds: branch.maxSeconds });
  if (!outcome || Number(outcome.cost) > branch.maxCost || Number(outcome.elapsedSeconds) > branch.maxSeconds) {
    throw new Error('lineage-search-arm-budget-exceeded');
  }
  return { branchId: branch.branchId, candidateId: candidate.candidateId, outcome,
    status: outcome?.verified === true ? 'evidence_ready' : 'inconclusive' };
}

async function search(options) {
  validate(options);
  const results = [];
  let spent = 0;
  for (const [index, candidate] of options.candidates.entries()) {
    if (spent >= options.maxCost) break;
    const result = await evaluateArm({ options, candidate, index, remainingCost: options.maxCost - spent });
    spent += Math.max(0, Number(result.outcome?.cost) || 0);
    results.push(result);
  }
  const event = await appendEvent(options.db, { ...options.scope, type: 'evidence_attached',
    payload: { kind: 'gvx_lineage_search', results, spent, maxCost: options.maxCost, maxSeconds: options.maxSeconds } });
  return { eventId: event.id, results, spent, maxCost: options.maxCost, status: results.length ? 'candidate_results' : 'budget_exhausted', promotion: 'external_gate_required' };
}

module.exports = { search, validate, evaluateArm };
