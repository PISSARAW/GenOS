'use strict';

const { validateMorphogenesisProposal } = require('./morphogenesisProposalValidator');

const REQUIRED_SERVICES = Object.freeze([
  'observe', 'diagnose', 'generateNeeds', 'repairOrSynthesize', 'typeCheck',
  'hardGate', 'paretoEvaluate', 'kernel', 'governance', 'transition', 'credit', 'memory'
]);
const SHADOW_SERVICES = Object.freeze([
  'observe', 'diagnose', 'generateNeeds', 'repairOrSynthesize', 'typeCheck', 'hardGate', 'paretoEvaluate'
]);

function validateServices(services, mode = 'commit') {
  const required = mode === 'shadow' ? SHADOW_SERVICES : REQUIRED_SERVICES.filter((name) => name !== 'kernel');
  const missing = required.filter((name) => !services || typeof services[name] !== 'function');
  if (mode !== 'shadow' && typeof services?.kernel?.adjudicate !== 'function') missing.push('kernel.adjudicate');
  return missing;
}

async function evaluateProposal(context, services) {
  const observation = await services.observe(context);
  const diagnosis = await services.diagnose({ context, observation });
  const needs = await services.generateNeeds({ context, observation, diagnosis });
  const proposal = await services.repairOrSynthesize({ context, needs, diagnosis });
  const structural = validateMorphogenesisProposal(proposal);
  if (!structural.valid) return { accepted: false, reason: 'proposal_validation_failed', structural };
  const assessment = await assessCandidate(context, services, proposal);
  return { ...assessment, observation, diagnosis, needs, proposal };
}

async function assessCandidate(context, services, proposal) {
  const typing = proposal.decision === 'NO_CHANGE' ? { valid: true, noChange: true } : await services.typeCheck(proposal);
  if (!typing || typing.valid !== true) return { accepted: false, reason: 'type_check_failed', typing };
  const hard = await services.hardGate({ proposal, context });
  if (!hard || hard.passed !== true) return { accepted: false, reason: 'hard_constraint_gate_failed', hard };
  const pareto = await services.paretoEvaluate({ proposal, context });
  if (!pareto || pareto.accepted !== true) return { accepted: false, reason: 'pareto_rejected', pareto };
  return assessCounterfactual({ context, services, proposal, typing, hard, pareto });
}

async function assessCounterfactual(input) {
  const { context, services, proposal, typing, hard, pareto } = input;
  const counterfactual = proposal.counterfactualRequired ? await runCounterfactual(services, proposal, context) : null;
  if (counterfactual && counterfactual.accepted !== true) return { accepted: false, reason: 'counterfactual_rejected', counterfactual };
  return { accepted: true, typing, hard, pareto, counterfactual };
}

async function runCounterfactual(services, proposal, context) {
  if (typeof services.counterfactual !== 'function') throw new Error('counterfactual adapter is required for this proposal');
  const result = await services.counterfactual({ proposal, context });
  if (!result || result.accepted !== true) return { accepted: false, result };
  return result;
}

async function runMorphogenesisRuntime(context, services) {
  const mode = context?.mode || 'commit';
  if (!['shadow', 'commit'].includes(mode)) return { decision: 'REJECTED', committed: false, errors: ['unsupported runtime mode'] };
  const missing = validateServices(services, mode);
  if (missing.length) return { decision: 'REJECTED', committed: false, errors: missing.map((name) => `missing runtime service: ${name}`) };
  const evaluated = await evaluateProposal(context, services);
  if (!evaluated.accepted) return { decision: 'REJECTED', committed: false, evaluation: evaluated };
  if (mode === 'shadow') return {
    decision: 'SHADOWED',
    committed: false,
    authorityPending: 'rust_kernel_and_governance',
    proposal: evaluated.proposal,
    evaluation: evaluated
  };
  return applyProposal(context, services, evaluated);
}

async function applyProposal(context, services, evaluated) {
  const decision = await services.kernel.adjudicate({ context, proposal: evaluated.proposal,
    evaluation: evaluated });
  if (!decision || decision.valid !== true || decision.decision !== 'APPLY') {
    return { decision: 'REJECTED', committed: false, evaluation: evaluated,
      authorization: { decision } };
  }
  const governance = await services.governance({ context, proposal: evaluated.proposal, decision });
  if (!governance || governance.allowed !== true) return { decision: 'REJECTED', committed: false,
    evaluation: evaluated, authorization: { decision, governance } };
  const transition = await services.transition({ context, proposal: evaluated.proposal,
    evaluation: evaluated, authorization: { decision, governance } });
  if (!transition || transition.committed !== true) return { decision: 'REJECTED', committed: false,
    code: transition?.code || 'MORPHOGENESIS_TRANSITION_NOT_COMMITTED', evaluation: evaluated,
    authorization: { decision, governance }, transition };
  const credit = await services.credit({ context, proposal: evaluated.proposal, transition });
  const memory = await services.memory({ context, proposal: evaluated.proposal, transition, credit });
  return { decision: 'APPLIED', committed: true, proposal: evaluated.proposal, evaluation: evaluated,
    authorization: { decision, governance }, transition, credit, memory };
}

module.exports = { REQUIRED_SERVICES, SHADOW_SERVICES, runMorphogenesisRuntime, validateServices };
