'use strict';

const assert = require('node:assert/strict');
const experiments = require('../src/services/endogenousThoughtExperimentService');
const protocol = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../benchmarks/endogenous-thought/protocol-v1.json'), 'utf8');

const parsed = JSON.parse(protocol);

assert(Array.isArray(experiments.CONDITIONS));
for (const condition of parsed.conditions) {
  assert(experiments.CONDITIONS.includes(condition), `${condition} condition exists`);
}
assert.equal(new Set(experiments.CONDITIONS).size, experiments.CONDITIONS.length);

function database() {
  const objects = new Map();
  return {
    async get(_sql, scope, key) {
      const payload = objects.get(`${scope}:${key}`);
      return payload === undefined ? null : { payload_json: payload };
    },
    async run(sql, scope, key, payload) {
      if (sql.includes('INSERT OR REPLACE INTO adaptive_state')) {
        objects.set(`${scope}:${key}`, payload);
      }
      return { changes: 1 };
    }
  };
}

async function main() {
  const cases = [{ caseId: 'case-1', input: { value: 1 } },
    { caseId: 'case-2', input: { value: 2 } }];
  const receipt = await experiments.run({
    agentId: 'agent-1', snapshot: { x: 1 }, environment: { model: 'm', dependencies: [], toolLease: 'lease' },
    cases, protocol: parsed, holdout: false, db: database(),
    execute: async ({ caseId, condition }) => {
      if (caseId === 'case-1' && condition === 'planned_control') {
        throw Object.assign(new Error('injected control failure'), { code: 'CONTROL_FAILED' });
      }
      return { success: true, episodes: 1, developmentUtility: caseId === 'case-1' ? 1 : 0,
        verifiedDiscoveries: 1, normalizedCost: 1, scientificEvidence: false,
        budgetViolations: 0, duplicates: 0 };
    }
  });
  assert.equal(receipt.promotionDecision, null);
  assert.equal(receipt.holdout, false);
  assert.equal(receipt.publishable, false);
  assert.equal(receipt.evidenceStatus, 'development_only');
  assert.match(receipt.caveat, /not holdout evidence/);
  assert.ok(receipt.summary.full);
  assert.ok(receipt.summary.planned_control);
  assert.equal(receipt.summary.full.verifiedDiscoveries, 0);
  assert.equal(receipt.summary.full.normalizedCost, 0);
  assert.equal(receipt.summary.planned_control.failures, 1);
  assert.equal(receipt.negativeResults.failures.length, 1);
  assert.equal(receipt.negativeResults.failures[0].code, 'CONTROL_FAILED');
  assert.deepEqual(receipt.negativeResults.noGainAgainstPlannedControl, [{
    caseId: 'case-2', fullScore: 0, plannedControlScore: 0,
    basis: 'synthetic_development_indicator', scientificEvidence: false
  }]);
  assert.equal(receipt.negativeResults.scientificClaimAllowed, false);

  await assert.rejects(experiments.run({
    agentId: 'agent-1', snapshot: { x: 1 }, environment: { model: 'm' },
    cases, protocol: parsed, execute: async () => ({ success: true })
  }), /boolean holdout flag/);
  await assert.rejects(experiments.runReplicationCampaign({
    replications: [{ holdout: true }, { holdout: false }, { holdout: true }]
  }), /development-corpus runs/);
  console.log('ETT experiment service checks passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
