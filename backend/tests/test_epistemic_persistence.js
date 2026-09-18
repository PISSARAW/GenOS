const assert = require('node:assert/strict');
const revision = require('../src/services/epistemic/revisionSurface');
const bus = require('../src/services/epistemic/contradictionBus');

async function main() {
  const claims = new Map();
  const events = [];
  const db = {
    all: async () => [...claims.values()].map((claim) => ({ id: claim.id, claim_json: JSON.stringify(claim) })),
    run: async (...args) => {
      const [sql, id, subject, claimJson, quality] = args;
      if (sql.includes('epistemic_claims')) claims.set(id, { ...JSON.parse(claimJson), id, subject, quality });
      if (sql.includes('epistemic_events')) events.push({ id, subject, claimJson, quality });
    }
  };
  revision.configureRevisionStore(db);
  bus.configureEventStore(db);
  const claim = { id: 'claim-1', type: 'factual', subject: 'runtime', evidence: [{ kind: 'observation', what: 'old' }] };
  await revision.persistClaim(claim);
  const result = await revision.batchReviseOnEvidence('runtime', 'test_result', { result: 'new' });
  assert.equal(result.status, 'completed');
  assert.equal(result.count, 1);
  assert.equal(claims.get('claim-1').evidence.length, 2);
  bus.publishAndRecord('claim_revised', { claimId: 'claim-1', subject: 'runtime' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 1);
}

main().then(() => console.log('Epistemic claims and events are persisted and revised.'));
