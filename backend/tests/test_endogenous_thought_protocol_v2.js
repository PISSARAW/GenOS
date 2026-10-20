'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const protocolService = require('../src/services/endogenousThoughtProtocolService');
const campaignService = require('../src/services/endogenousThoughtScientificCampaignService');

const ROOT = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeProviders(overrides = {}) {
  const producer = {
    id: 'solver-provider', keyId: 'solver-key',
    async solve(request) {
      return { answer: `answer:${request.condition}:${request.seed}`, findings: ['finding-1'] };
    }
  };
  const verifier = {
    id: 'independent-verifier', keyId: 'verifier-key',
    async verify(input) {
      return {
        schema: 'genos.ett-independent-verification/v1',
        verifierId: this.id, verifierKeyId: this.keyId,
        producerId: 'solver-provider', proposalHash: input.proposalHash,
        verdict: 'supported', evidenceRefs: [input.oracle.ref], usefulDiscoveries: 1
      };
    }
  };
  const usageMeter = {
    id: 'external-meter', keyId: 'meter-key', source: 'external',
    async measure(input) {
      return {
        schema: 'genos.ett-external-usage/v1', source: 'external', meterId: this.id,
        executionId: input.executionId, tokens: 600, usd: 0.02, seconds: 4
      };
    }
  };
  return { producer, verifier, usageMeter, ...overrides };
}

function makeOptions(overrides = {}) {
  const budget = { tokens: 12000, usd: 0.5, seconds: 120 };
  const arm = { model: 'test-model-v1', parameters: { temperature: 0, topP: 1 },
    tools: ['read_case', 'submit_answer'], budget };
  return {
    campaignId: 'ett-v2-test-campaign',
    protocol: readJson('benchmarks/endogenous-thought/protocol-v2.json'),
    metricSet: readJson('shared/endogenousThoughtMetrics.v1.json'),
    providers: makeProviders(),
    runtime: { full: clone(arm), llm_only: clone(arm) },
    cases: [{ caseId: 'reserved-case-1', split: 'reserved', input: { value: 7 },
      oracle: { ref: 'oracle:reserved-case-1' } }],
    replications: [
      { replicationId: 'holdout-401', seed: 401, holdout: true },
      { replicationId: 'holdout-503', seed: 503, holdout: true },
      { replicationId: 'holdout-607', seed: 607, holdout: true }
    ],
    ...overrides
  };
}

async function rejectsCode(options, code) {
  await assert.rejects(() => campaignService.runScientificCampaign(options),
    (error) => error?.code === code);
}

async function main() {
  const options = makeOptions();
  assert.equal(protocolService.validateProtocol(options.protocol, options.metricSet).valid, true);
  assert.equal(options.protocol.status, 'preregistered_not_run');
  assert.equal(options.protocol.executed, false);
  assert.equal(options.protocol.evidencePolicy.scientificPromotionAllowed, false);
  assert.equal(options.protocol.conditionContracts.llm_only.endogenousLoopEnabled, false);

  const receipt = await campaignService.runScientificCampaign(options);
  assert.equal(receipt.replications.length, 3);
  assert.equal(receipt.replications.every((item) => item.outcomes.length === 2), true);
  assert.match(receipt.runtimeProfileHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.replications.flatMap((item) => item.outcomes)
    .every((item) => item.independentlyVerified && !item.modelOutputIsEvidence), true);
  assert.equal(receipt.scientificPromotionAllowed, false);
  assert.equal(receipt.promotionDecision, null);
  assert.equal(receipt.publishable, false);
  assert.equal(options.protocol.status, 'preregistered_not_run');

  const sameIdentity = makeOptions();
  sameIdentity.providers.verifier.id = sameIdentity.providers.producer.id;
  await rejectsCode(sameIdentity, 'ETT_VERIFIER_NOT_INDEPENDENT');

  const unequalBudget = makeOptions();
  unequalBudget.runtime.llm_only.budget.tokens -= 1;
  await rejectsCode(unequalBudget, 'ETT_BUDGET_NOT_COMPARABLE');

  const selfReported = makeOptions();
  selfReported.providers.producer.solve = async () => ({ answer: 'x', usage: { tokens: 1 } });
  await rejectsCode(selfReported, 'ETT_SELF_REPORTED_COST_REJECTED');

  const insufficientHoldout = makeOptions();
  insufficientHoldout.replications = insufficientHoldout.replications.slice(0, 2);
  await rejectsCode(insufficientHoldout, 'ETT_HOLDOUT_REPLICATIONS_INSUFFICIENT');

  const divergentParameters = makeOptions();
  divergentParameters.runtime.llm_only.parameters.temperature = 0.1;
  await rejectsCode(divergentParameters, 'ETT_RUNTIME_PARAMETERS_DIVERGED');

  const selfMetered = makeOptions();
  selfMetered.providers.usageMeter.id = selfMetered.providers.producer.id;
  await rejectsCode(selfMetered, 'ETT_EXTERNAL_COST_METER_REQUIRED');

  console.log('ETT v2 preregistration, injected providers and refusal boundaries passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
