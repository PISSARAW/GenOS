'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { runKind } = require('./run_worker_gate_campaign.cjs');

async function testVerifiedMission() {
  const result = await runKind('procedural_executor', new Set());
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.result?.oracle?.status, 'accepted_at_decision');
  assert.equal(result.qualification.status, 'verified');
  assert.equal(result.qualification.reason, 'independent_quorum');
  assert.equal(result.verified, true);
}

async function testTamperedOracle() {
  const result = await runKind('procedural_executor', new Set(), {
    beforeQualification: async (db) => {
      const row = await db.get('SELECT id FROM aeis_assurance_assemblies LIMIT 1');
      assert.ok(row, 'the real mission must have persisted an AEIS assembly');
      await db.run('UPDATE aeis_assurance_assemblies SET payload_json = ? WHERE id = ?',
        '{"tampered":true}', row.id);
    }
  });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.result?.oracleAccepted, true);
  assert.equal(result.qualification.status, 'inconclusive');
  assert.equal(result.qualification.reason, 'oracle_proof_invalid');
  assert.equal(result.verified, false);
}

async function testTimeoutWithoutProof() {
  const script = path.join(__dirname, 'fixtures/workerGateNeverCompletes.cjs');
  const result = await runKind('procedural_executor', new Set(), { script, timeoutMs: 100 });
  assert.equal(result.exitCode, null);
  assert.equal(result.result, null);
  assert.equal(result.qualification.status, 'inconclusive');
  assert.equal(result.qualification.reason, 'mission_evidence_missing');
  assert.equal(result.verified, false);
}

async function main() {
  await testVerifiedMission();
  await testTamperedOracle();
  await testTimeoutWithoutProof();
  process.stdout.write('worker gate campaign: verified, tampered oracle and timeout refused\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
