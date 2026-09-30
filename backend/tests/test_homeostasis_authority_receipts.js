'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `genos_homeostasis_receipts_${Date.now()}.db`);
process.env.GENOS_DB_PATH = dbPath;
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-only';

const { getDatabase, closeDatabase } = require('../src/db');
const homeostasis = require('../src/services/homeostasisService');
const policy = require('../src/services/homeostasisPolicyService');
const { newOrganism } = require('../src/services/missionOrganismService');

async function run() {
  const db = await getDatabase(dbPath);
  const mission = {
    id: 'homeostasis_receipt_test',
    completionContract: {
      invariants: [{
        id: 'works', kind: 'functional', verifier: { type: 'context.flag', flag: 'works' }
      }]
    }
  };
  const organism = newOrganism({ genome: { objective: 'receipt test' } });
  const success = await homeostasis.transitionMissionToComplete(db, {
    mission, organism, context: { flags: { works: true }, evidence: ['test_run_1'] }
  });
  assert.strictEqual(success.allowed, true);
  assert.strictEqual(success.receipt.schema, 'genos.homeostasis-transition-receipt/v1');
  assert.strictEqual(success.receipt.contractRevision, 1);
  assert.deepStrictEqual(success.receipt.evidenceReferences, ['test_run_1']);

  const denied = await homeostasis.transitionMissionToComplete(db, {
    mission, organism, context: { flags: { works: false } }
  });
  assert.strictEqual(denied.allowed, false);
  assert.strictEqual(denied.receipt.allowed, false);
  assert.strictEqual(denied.receipt.contractRevision, 1);

  mission.completionContract.invariants[0] = {
    id: 'works_v2', kind: 'functional', verifier: { type: 'context.flag', flag: 'worksV2' }
  };
  const revised = await homeostasis.transitionMissionToComplete(db, {
    mission, organism, context: { flags: { worksV2: true } }
  });
  assert.strictEqual(revised.allowed, true);
  assert.strictEqual(revised.receipt.contractRevision, 2);

  const contracts = await db.all(
    'SELECT * FROM homeostasis_contract_revisions WHERE mission_id = ?', [mission.id]
  );
  const receipts = await db.all(
    'SELECT * FROM homeostasis_transition_receipts WHERE mission_id = ?', [mission.id]
  );
  assert.strictEqual(contracts.length, 2, 'changed contracts receive a new immutable revision');
  assert.strictEqual(receipts.length, 3, 'every allowed and denied transition is durable');
  const policySnapshot = JSON.parse(contracts[1].contract_json);
  assert.strictEqual(policySnapshot.policyVersion, 'genos.homeostasis-policy/v1');
  assert.strictEqual(policySnapshot.minimumFunctionalCoverage, 1);
  const computedHash = crypto.createHash('sha256').update(receipts[0].receipt_json).digest('hex');
  assert.strictEqual(computedHash, receipts[0].receipt_hash);

  assert.throws(() => policy.resolveHomeostasisPolicy({ minimumFunctionalCoverage: 1.1 }));
  assert.strictEqual(policy.resolveHomeostasisPolicy({ minimumFunctionalCoverage: 0.5 }).version,
    'genos.homeostasis-policy/v1');
  await closeDatabase();
  fs.unlinkSync(dbPath);
  console.log('homeostasis authority and transition receipt checks passed');
}

run().catch(async (error) => {
  console.error(error);
  try { await closeDatabase(); } catch (_) {}
  try { fs.unlinkSync(dbPath); } catch (_) {}
  process.exitCode = 1;
});
