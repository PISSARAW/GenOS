'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const { validateProtocol: validateRegisteredProtocol } = require('./endogenousThoughtProtocolService');

const CONDITIONS = Object.freeze(['full', 'llm_only']);

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireValue(condition, code, message) {
  if (!condition) throw failure(code, message);
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalizedTools(tools) {
  requireValue(Array.isArray(tools), 'ETT_RUNTIME_TOOLS_INVALID');
  return [...tools].sort();
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function validateCampaignProtocol(options) {
  const result = validateRegisteredProtocol(options.protocol, options.metricSet);
  requireValue(result.valid, 'ETT_PROTOCOL_V2_INVALID', result.errors.join(', '));
}

function validateProviderShape(provider, method, code) {
  requireValue(provider && typeof provider.id === 'string' && provider.id.length > 0, code);
  requireValue(typeof provider.keyId === 'string' && provider.keyId.length > 0, code);
  requireValue(typeof provider[method] === 'function', code);
}

function validateProviders(providers) {
  validateProviderShape(providers?.producer, 'solve', 'ETT_PRODUCER_INVALID');
  validateProviderShape(providers?.verifier, 'verify', 'ETT_VERIFIER_INVALID');
  validateProviderShape(providers?.usageMeter, 'measure', 'ETT_USAGE_METER_INVALID');
  const { producer, verifier, usageMeter } = providers;
  requireValue(producer.id !== verifier.id && producer.keyId !== verifier.keyId,
    'ETT_VERIFIER_NOT_INDEPENDENT');
  requireValue(usageMeter.source === 'external', 'ETT_EXTERNAL_COST_METER_REQUIRED');
  requireValue(![producer.id, verifier.id].includes(usageMeter.id), 'ETT_EXTERNAL_COST_METER_REQUIRED');
  requireValue(![producer.keyId, verifier.keyId].includes(usageMeter.keyId),
    'ETT_EXTERNAL_COST_METER_REQUIRED');
}

function validateArmParity(runtime, protocol) {
  const full = runtime?.full;
  const baseline = runtime?.llm_only;
  requireValue(full?.model && baseline?.model && full.model === baseline.model,
    'ETT_MODEL_NOT_COMPARABLE');
  requireValue(same(full.parameters, baseline.parameters), 'ETT_RUNTIME_PARAMETERS_DIVERGED');
  requireValue(same(normalizedTools(full.tools), normalizedTools(baseline.tools)),
    'ETT_TOOL_LEASE_DIVERGED');
  requireValue(same(full.budget, baseline.budget) && same(full.budget, protocol.budget),
    'ETT_BUDGET_NOT_COMPARABLE');
}

function validateReplications(replications, protocol) {
  const minimum = protocol.corpus.reserved.minimumIndependentReplications;
  requireValue(Array.isArray(replications) && replications.length >= minimum,
    'ETT_HOLDOUT_REPLICATIONS_INSUFFICIENT');
  const seeds = replications.map((item) => item.seed);
  const ids = replications.map((item) => item.replicationId);
  const reserved = protocol.corpus.reserved.seeds;
  requireValue(replications.every((item) => item.holdout === true && reserved.includes(item.seed)),
    'ETT_RESERVED_CORPUS_REQUIRED');
  requireValue(new Set(seeds).size === seeds.length && new Set(ids).size === ids.length,
    'ETT_HOLDOUT_REPLICATIONS_NOT_INDEPENDENT');
}

function validateCases(cases) {
  requireValue(Array.isArray(cases) && cases.length > 0, 'ETT_RESERVED_CASES_REQUIRED');
  requireValue(cases.every((item) => item?.split === 'reserved' && item.caseId),
    'ETT_RESERVED_CASES_REQUIRED');
}

function assertNoSelfReportedCost(proposal) {
  const forbidden = ['usage', 'cost', 'measuredUsage', 'normalizedCost'];
  requireValue(proposal && forbidden.every((key) => proposal[key] === undefined),
    'ETT_SELF_REPORTED_COST_REJECTED');
}

function validateMeasurement(measurement, context) {
  requireValue(measurement?.schema === 'genos.ett-external-usage/v1'
    && measurement.source === 'external'
    && measurement.meterId === context.usageMeter.id
    && measurement.executionId === context.executionId,
  'ETT_EXTERNAL_COST_MEASUREMENT_INVALID');
  requireValue(['tokens', 'usd', 'seconds'].every((key) => Number.isFinite(measurement[key])
    && measurement[key] >= 0), 'ETT_EXTERNAL_COST_MEASUREMENT_INVALID');
}

function validateVerification(verification, context) {
  requireValue(verification?.schema === 'genos.ett-independent-verification/v1'
    && verification.verifierId === context.verifier.id
    && verification.verifierKeyId === context.verifier.keyId
    && verification.producerId === context.producer.id
    && verification.proposalHash === context.proposalHash,
  'ETT_INDEPENDENT_VERIFICATION_INVALID');
  requireValue(['supported', 'refuted', 'inconclusive'].includes(verification.verdict),
    'ETT_INDEPENDENT_VERIFICATION_INVALID');
  requireValue(Array.isArray(verification.evidenceRefs) && verification.evidenceRefs.length > 0,
    'ETT_INDEPENDENT_VERIFICATION_INVALID');
  requireValue(Number.isInteger(verification.usefulDiscoveries)
    && verification.usefulDiscoveries >= 0, 'ETT_INDEPENDENT_VERIFICATION_INVALID');
}

function normalizedCost(measurement, budget) {
  const ratios = [measurement.tokens / budget.tokens, measurement.usd / budget.usd,
    measurement.seconds / budget.seconds];
  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}

function executionRequest(context) {
  return Object.freeze({
    protocolId: context.protocol.protocolId,
    condition: context.condition,
    caseId: context.testCase.caseId,
    input: context.testCase.input,
    seed: context.replication.seed,
    model: context.arm.model,
    parameters: context.arm.parameters,
    tools: context.arm.tools,
    budget: context.arm.budget
  });
}

async function executeArm(context) {
  const request = executionRequest(context);
  const executionId = digest({ request, replicationId: context.replication.replicationId });
  const proposal = await context.providers.producer.solve(request);
  assertNoSelfReportedCost(proposal);
  const proposalHash = digest(proposal);
  const common = { ...context.providers, executionId, proposalHash };
  const measurement = await context.providers.usageMeter.measure({ executionId,
    producerId: context.providers.producer.id, budget: context.arm.budget });
  validateMeasurement(measurement, common);
  const verification = await context.providers.verifier.verify({ request, proposal,
    proposalHash, oracle: context.testCase.oracle });
  validateVerification(verification, common);
  return {
    executionId, condition: context.condition, caseId: context.testCase.caseId,
    replicationId: context.replication.replicationId, seed: context.replication.seed,
    proposalHash, verdict: verification.verdict,
    verifiedUsefulDiscoveries: verification.usefulDiscoveries,
    evidenceRefs: verification.evidenceRefs, measuredUsage: measurement,
    normalizedCost: normalizedCost(measurement, context.arm.budget),
    modelOutputIsEvidence: false, independentlyVerified: true
  };
}

async function executeReplication(context) {
  const outcomes = [];
  for (const testCase of context.cases) {
    for (const condition of CONDITIONS) {
      outcomes.push(await executeArm({ ...context, testCase, condition,
        arm: context.runtime[condition] }));
    }
  }
  return { replicationId: context.replication.replicationId,
    seed: context.replication.seed, holdout: true, outcomes };
}

async function runScientificCampaign(options) {
  validateCampaignProtocol(options);
  validateProviders(options.providers);
  validateArmParity(options.runtime, options.protocol);
  validateReplications(options.replications, options.protocol);
  validateCases(options.cases);
  const replications = [];
  for (const replication of options.replications) {
    replications.push(await executeReplication({ ...options, replication }));
  }
  return {
    schema: 'genos.endogenous-thought-campaign-receipt/v2',
    campaignId: options.campaignId,
    protocolId: options.protocol.protocolId,
    protocolHash: digest(options.protocol),
    runtimeProfileHash: digest(options.runtime),
    status: 'descriptive_holdout_complete',
    conditions: CONDITIONS,
    replications,
    modelOutputIsEvidence: false,
    scientificPromotionAllowed: false,
    promotionDecision: null,
    publishable: false
  };
}

module.exports = { runScientificCampaign };
