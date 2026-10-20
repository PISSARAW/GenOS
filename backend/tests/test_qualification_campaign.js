'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gate = require('../src/services/campaignActivationGateService');
const campaign = require('../src/services/qualificationCampaignService');
const cli = require('../bin/genos-qualification-campaign.cjs');

const REVISION = 'a'.repeat(40);

function config(id) {
  return {
    schema: 'genos.qualification-campaign/v1', campaignId: id,
    status: 'configured_not_run', revision: REVISION,
    costBudget: { tokens: 10000, usd: 10, seconds: 1000 },
    workloads: [
      { id: 'ett', kind: 'ett_v2', adapterId: 'ett-adapter', configuration: { protocol: 'v2' } },
      { id: 'stewardship', kind: 'stewardship', adapterId: 'stewardship-adapter',
        configuration: { phases: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'] } }
    ],
    activationRequirements: [...gate.REQUIRED_EVIDENCE]
  };
}

function cost(id) {
  return {
    schema: 'genos.external-campaign-cost/v1', source: 'external',
    meterId: `meter-${id}`, meterKeyId: `meter-key-${id}`, receiptRef: `cost:${id}`,
    receiptHash: gate.digest({ id, kind: 'external-cost' }),
    tokens: 100, usd: 0.1, seconds: 2
  };
}

function proof(context, requirementId, producerId) {
  return gate.sealEvidenceProof({
    requirementId, status: 'SUPPORTED', evidenceClass: 'synthetic',
    configHash: context.configHash, revision: context.revision,
    artifactRef: `artifact:${requirementId}`, artifactHash: gate.digest({ requirementId }),
    producerId, verifierId: `verifier:${requirementId}`,
    verifierKeyId: `verifier-key:${requirementId}`
  });
}

function adapters(input = {}) {
  const calls = { ett: 0, stewardship: 0 };
  const result = {
    calls,
    values: {
      'ett-adapter': {
        id: 'ett-adapter',
        async execute(context) {
          calls.ett += 1;
          return {
            outcomes: input.ettOutcomes || [{ status: 'SUCCEEDED', runId: 'ett-run-1' }],
            proofs: (input.ettProofs || []).map((id) => proof(context, id, this.id)),
            externalCost: cost('ett')
          };
        }
      },
      'stewardship-adapter': {
        id: 'stewardship-adapter',
        async execute(context) {
          calls.stewardship += 1;
          return {
            outcomes: input.stewardshipOutcomes || [{ status: 'NO_CHANGE', cycleId: 'cycle-1' }],
            proofs: (input.stewardshipProofs || []).map((id) => proof(context, id, this.id)),
            externalCost: cost('stewardship')
          };
        }
      }
    }
  };
  return result;
}

async function blockedAndIdempotent(root) {
  const providers = adapters({
    ettOutcomes: [{ status: 'SUCCEEDED' }, { status: 'FAILED', code: 'case-failed' }],
    stewardshipOutcomes: [{ status: 'NO_CHANGE' },
      { status: 'INTERVENTION_REQUIRED', reviewRef: 'review:1' }]
  });
  const options = { config: config('blocked-campaign'), currentRevision: REVISION,
    outputPath: path.join(root, 'blocked.json'), adapters: providers.values };
  const first = await campaign.runQualificationCampaign(options);
  assert.equal(first.activation.status, 'blocked');
  assert(first.activation.missingEvidence.length > 0);
  assert.deepEqual(first.dossier.workloads.flatMap((item) => item.outcomes)
    .map((item) => item.status), ['SUCCEEDED', 'FAILED', 'NO_CHANGE', 'INTERVENTION_REQUIRED']);
  assert.equal(first.dossier.costs.measurementComplete, true);
  assert(first.dossier.costs.receipts.every((item) => /^[a-f0-9]{64}$/.test(item.costHash)));

  const resumed = await campaign.runQualificationCampaign(options);
  assert.equal(resumed.resumed, true);
  assert.deepEqual(providers.calls, { ett: 1, stewardship: 1 });
  return options;
}

async function rejectsTampering(options) {
  const state = JSON.parse(fs.readFileSync(options.outputPath, 'utf8'));
  state.events.find((event) => event.type === 'WORKLOAD_COMPLETED')
    .result.outcomes[0].status = 'SUCCEEDED_AFTER_EDIT';
  fs.writeFileSync(options.outputPath, JSON.stringify(state));
  const result = await campaign.runQualificationCampaign(options);
  assert.equal(result.activation.status, 'failed');
  assert.equal(result.activation.reason, 'CAMPAIGN_STATE_TAMPERED');
}

async function syntheticNeverProduces(root) {
  const split = 9;
  const providers = adapters({ ettProofs: gate.REQUIRED_EVIDENCE.slice(0, split),
    stewardshipProofs: gate.REQUIRED_EVIDENCE.slice(split) });
  const result = await campaign.runQualificationCampaign({
    config: config('synthetic-complete'), currentRevision: REVISION,
    outputPath: path.join(root, 'synthetic.json'), adapters: providers.values
  });
  assert.equal(result.activation.status, 'qualified_non_production');
  assert.equal(result.activation.syntheticEvidenceOnly, true);
  assert.equal(result.activation.productionAllowed, false);
  assert.equal(result.activation.scientificPromotionAllowed, false);
  assert.equal(result.activation.promotionDecision, null);
  assert.equal(result.dossier.productionAllowed, false);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-qualification-campaign-'));
  try {
    const options = await blockedAndIdempotent(root);
    await rejectsTampering(options);
    await syntheticNeverProduces(root);
    assert.equal(cli.parseArgs(['--help']).help, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().then(() => console.log('Qualification campaign sealing and activation gates passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
