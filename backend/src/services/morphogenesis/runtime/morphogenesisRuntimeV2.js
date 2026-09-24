'use strict';

const { validateMorphogenesisProposal } = require('./morphogenesisProposalValidator');

const REQUIRED_SERVICES = Object.freeze([
  'observe', 'diagnose', 'generateNeeds', 'repairOrSynthesize', 'typeCheck',
  'hardGate', 'paretoEvaluate', 'kernel', 'governance', 'transition', 'credit', 'memory'
]);

function validateServices(services) {
  return REQUIRED_SERVICES.filter((name) => !services || typeof services[name] !== 'function' && name !== 'kernel');
}

async function evaluateProposal(context, services) {
  const observation = await services.observe(context);
  const diagnosis = await services.diagnose({ context, observation });
  const needs = await services.generateNeeds({ context, observation, diagnosis });
  const proposal = await services.repairOrSynthesize({ context, needs, diagnosis });
  const structural = validateMorphogenesisProposal(proposal);
  if (!structural.valid) return { accepted: false, reason: 'proposal_validation_failed', structural };
  const typing = await services.typeCheck(proposal);
  if (!typing || typing.valid !== true) return { accepted: false, reason: 'type_check_failed', typing };
  const hard = await services.hardGate({ proposal, context });
  if (!hard || hard.passed !== true) return { accepted: false, reason: 'hard_constraint_gate_failed', hard };
  const pareto = await services.paretoEvaluate({ proposal, context });
  if (!pareto || pareto.accepted !== true) return { accepted: false, reason: 'pareto_rejected', pareto };
  const counterfactual = proposal.counterfactualRequired ? await runCounterfactual(services, proposal, context) : null;
  return { accepted: true, observation, diagnosis, needs, proposal, typing, hard, pareto, counterfactual };
}

async function runCounterfactual(services, proposal, context) {
  if (typeof services.counterfactual !== 'function') throw new Error('counterfactual adapter is required for this proposal');
  return services.counterfactual({ proposal, context });
}

async function authorizeProposal(evaluated, context, services) {
  if (!services.kernel || typeof services.kernel.adjudicate !== 'function') throw new Error('Rust kernel adjudication adapter is required');
  const decision = await services.kernel.adjudicate({ proposal: evaluated.proposal, context, evaluations: evaluated });
  if (!decision || decision.valid !== true) return { decision, rejected: true };
  if (decision.decision === 'NO_CHANGE') return { decision, rejected: false, noChange: true };
  const governance = await services.governance({ decision, proposal: evaluated.proposal, context });
  return { decision, governance, rejected: !governance || governance.allowed !== true, noChange: false };
}

async function commitDecision(input) {
  const { authorization, evaluated, context, services } = input;
  if (authorization.noChange) return { decision: 'NO_CHANGE', committed: false, reason: authorization.decision.reason, evidence: authorization.decision.evidence || [] };
  if (authorization.rejected) return { decision: 'REJECTED', committed: false, authorization };
  const transition = await services.transition({ command: authorization.decision.command, proposal: evaluated.proposal, context });
  if (!transition || transition.committed !== true) return { decision: 'ROLLBACK', committed: false, transition };
  const credit = await services.credit({ evaluated, transition, context });
  const memory = await services.memory({ evaluated, transition, credit, context });
  return { decision: 'APPLIED', committed: true, transition, credit, memory };
}

async function runMorphogenesisRuntime(context, services) {
  const missing = validateServices(services);
  if (missing.length) return { decision: 'REJECTED', committed: false, errors: missing.map((name) => `missing runtime service: ${name}`) };
  const evaluated = await evaluateProposal(context, services);
  if (!evaluated.accepted) return { decision: 'REJECTED', committed: false, evaluation: evaluated };
  const authorization = await authorizeProposal(evaluated, context, services);
  return commitDecision({ authorization, evaluated, context, services });
}

module.exports = { REQUIRED_SERVICES, runMorphogenesisRuntime, validateServices };
