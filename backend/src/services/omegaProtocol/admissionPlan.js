'use strict';

const registry = require('../cognitiveObligationRegistry');
const interop = require('../cognitiveOmegaInteropService');
const { digest } = require('../evidenceProtocol/canonical');
const { validateCapabilities, validateSubmission } = require('./contract');

const EFFECT_GUARANTEES = Object.freeze(['durable_intent', 'idempotency', 'reconciliation', 'fencing']);

function subset(requested, supplied, label) {
  const available = new Set(supplied);
  if (requested.some((item) => !available.has(item))) throw new Error(`OMEGA required ${label} unavailable.`);
}

function graph(program) {
  const obligations = program.operations.map(({ id, kind, dependsOn, state }) => ({ id, kind, dependsOn, state }));
  const result = registry.plan({ version: registry.VERSION, operation: 'OMEGA', obligations });
  if (result.status === 'blocked') throw new Error(`OMEGA obligation graph rejected: ${result.reason}.`);
}

function operationCapabilities(submission, capabilities) {
  const installed = new Map(capabilities.operations.map((item) => [item.kind, item.references]));
  for (const operation of submission.program.operations) {
    const references = installed.get(operation.kind) || [];
    subset([operation.reference], references, `${operation.kind} reference`);
    subset([operation.reference], submission.program.policy[operation.kind.toLowerCase()] || [], 'native policy permission');
    if (operation.kind === 'CHECK') subset([operation.reference], capabilities.verifierRefs, 'verifier');
  }
  for (const [kind, references] of Object.entries(submission.program.policy)) {
    subset(references, installed.get(kind.toUpperCase()) || [], 'native policy capability');
  }
}

function requirements(submission, capabilities) {
  subset([submission.domain], capabilities.domains, 'domain');
  if (submission.program.operations.length > capabilities.maxOperations) throw new Error('OMEGA operation capacity exceeded.');
  subset(submission.requirements.verifierRefs, capabilities.verifierRefs, 'verifier');
  subset(submission.requirements.effectGuarantees, capabilities.effectGuarantees, 'effect guarantee');
  const effects = submission.program.operations.some((item) => ['CALL', 'EMIT'].includes(item.kind));
  if (effects) subset(EFFECT_GUARANTEES, capabilities.effectGuarantees, 'mandatory effect guarantee');
}

function effectBudget(submission) {
  let remaining = submission.budget.limit - submission.budget.spent - submission.budget.reserved;
  for (const operation of submission.program.operations) {
    if (!['CALL', 'EMIT'].includes(operation.kind)) continue;
    const cost = submission.program.payload.requests[operation.id].cost;
    if (cost > remaining) throw new Error('OMEGA planned effects exceed available budget.');
    remaining -= cost;
  }
}

function buildPlan(input, installed, context) {
  const submission = validateSubmission(input);
  const capabilities = validateCapabilities(installed);
  graph(submission.program);
  operationCapabilities(submission, capabilities);
  requirements(submission, capabilities);
  effectBudget(submission);
  return { planId: submission.planId, programDigest: interop.digest(submission.program),
    capabilitiesDigest: digest(capabilities), policyDigest: digest(submission.policy),
    baseDigest: submission.baseDigest, environmentDigest: submission.environmentDigest,
    runtimeId: capabilities.runtimeId, runtimeGeneration: capabilities.generation, domain: submission.domain,
    contextDigest: digest(context), budget: submission.budget,
    obligations: submission.program.operations.map((operation) => ({ operationId: operation.id, kind: operation.kind,
      reference: operation.reference, dependsOn: operation.dependsOn, state: 'open' })) };
}

module.exports = { buildPlan, EFFECT_GUARANTEES };
