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
  const cases = [{ caseId: 'case-1', input: { value: 1 } }];
  const receipt = await experiments.run({
    agentId: 'agent-1', snapshot: { x: 1 }, environment: { model: 'm', dependencies: [], toolLease: 'lease' },
    cases, protocol: parsed, holdout: false, db: database(),
    execute: async ({ condition }) => ({ success: condition !== 'planned_control', episodes: 1,
      verifiedDiscoveries: 1, normalizedCost: 1, scientificEvidence: false,
      budgetViolations: 0, duplicates: 0 })
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
