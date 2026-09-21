'use strict';

const crypto = require('crypto');

const HOMEOSTASIS_SCHEMA = 'genos.homeostasis/v1alpha1';

const FUNCTIONAL = 'functional';
const STRUCTURAL = 'structural';
const EPISTEMIC = 'epistemic';
const SAFETY = 'safety';

const INVARIANT_CLASSES = Object.freeze([FUNCTIONAL, STRUCTURAL, EPISTEMIC, SAFETY]);

function invariantId(input) {
  return `inv_${crypto.randomUUID()}`;
}

function invariantClass(value) {
  if (value && INVARIANT_CLASSES.includes(value)) return value;
  throw new Error(`Unknown invariant class '${value}'. Allowed: ${INVARIANT_CLASSES.join(', ')}`);
}

function buildInvariant(input = {}) {
  const check = input.check;
  if (typeof check !== 'function') throw new Error('homeostasis invariant check must be a function');
  return {
    id: input.id || invariantId(input),
    kind: invariantClass(input.kind || input.class || FUNCTIONAL),
    label: input.label || null,
    check,
    satisfied: false,
    lastEvaluationAt: null,
    evaluation: null
  };
}

function buildHomeostasisContract(input = {}) {
  const invariants = (input.invariants || []).map(i => buildInvariant(i));
  const requiredEvidence = Array.isArray(input.requiredEvidence) ? input.requiredEvidence.slice() : [];
  const minimumFunctionalCoverage = Number.isFinite(input.minimumFunctionalCoverage)
    ? input.minimumFunctionalCoverage
    : 1;
  return {
    id: input.id || `homeostasis_${crypto.randomUUID()}`,
    missionId: input.missionId || null,
    invariants,
    requiredEvidence,
    minimumFunctionalCoverage,
    assembledAt: new Date().toISOString()
  };
}

function evaluateInvariant(invariant, context) {
  let satisfied = false;
  let evaluation = null;
  try {
    evaluation = invariant.check(context);
    satisfied = Boolean(evaluation);
  } catch (error) {
    evaluation = { error: error.message || String(error) };
    satisfied = false;
  }
  invariant.satisfied = satisfied;
  invariant.evaluation = evaluation;
  invariant.lastEvaluationAt = new Date().toISOString();
  return { invariant, satisfied };
}

function evaluateContract(contract, context) {
  const results = contract.invariants.map(inv => evaluateInvariant(inv, context));
  const functionalSatisfied = results.filter(r => r.invariant.kind === FUNCTIONAL && r.satisfied).length;
  const functionalRequired = contract.invariants.filter(i => i.kind === FUNCTIONAL).length || 1;
  const functionalRatio = functionalSatisfied / functionalRequired;
  const totalSatisfied = results.filter(r => r.satisfied).length;
  const total = results.length || 1;
  return {
    schema: HOMEOSTASIS_SCHEMA,
    missionId: contract.missionId,
    evaluatedAt: new Date().toISOString(),
    totalInvariants: total,
    satisfiedInvariants: totalSatisfied,
    ratio: totalSatisfied / total,
    functionalSatisfied,
    functionalRequired,
    functionalRatio,
    functionalMinCoverageMet: functionalRatio >= contract.minimumFunctionalCoverage,
    classSatisfaction: {
      functional: results.filter(r => r.invariant.kind === FUNCTIONAL && r.satisfied).length,
      structural: results.filter(r => r.invariant.kind === STRUCTURAL && r.satisfied).length,
      epistemic: results.filter(r => r.invariant.kind === EPISTEMIC && r.satisfied).length,
      safety: results.filter(r => r.invariant.kind === SAFETY && r.satisfied).length
    },
    failedInvariants: results.filter(r => !r.satisfied).map(r => ({
      id: r.invariant.id,
      kind: r.invariant.kind,
      label: r.invariant.label,
      evaluation: r.invariant.evaluation
    })),
    homeostasisSatisfied: totalSatisfied === total
  };
}

function homeostasisStatus(result) {
  if (!result || typeof result !== 'object') return 'unknown';
  if (result.homeostasisSatisfied) return 'homeostasis_satisfied';
  if (result.functionalMinCoverageMet) return 'partially_stable';
  if (result.classSatisfaction.safety < result.classSatisfaction.functional) return 'unsafe';
  return 'unstable';
}

module.exports = {
  HOMEOSTASIS_SCHEMA,
  INVARIANT_CLASSES,
  FUNCTIONAL,
  STRUCTURAL,
  EPISTEMIC,
  SAFETY,
  invariantId,
  buildInvariant,
  buildHomeostasisContract,
  evaluateInvariant,
  evaluateContract,
  homeostasisStatus
};