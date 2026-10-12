'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCampaign } = require('./run_worker_fault_campaign.cjs');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-fault-campaign-'));
  const output = path.join(root, 'campaign.json');
  try {
    const report = await runCampaign({ output,
      kinds: ['procedural_executor', 'verifier_worker', 'recovery_worker', 'liaison_worker'],
      tamperKind: 'verifier_worker', timeoutKind: 'recovery_worker' });
    assert.equal(report.passed, true);
    assert.equal(report.results.length, 4);
    assert.equal(report.results[0].qualification.reason, 'independent_quorum');
    assert.equal(report.results[1].injectedFault, 'tampered_assembly');
    assert.equal(report.results[1].qualification.reason, 'oracle_proof_invalid');
    assert.equal(report.results[2].injectedFault, 'process_timeout');
    assert.equal(report.results[2].qualification.reason, 'mission_evidence_missing');
    assert.equal(report.results[3].qualification.reason, 'independent_quorum');
    assert.ok(report.uniqueAcceptedNonces > 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), report);
    process.stdout.write('Worker fault campaign: healthy missions verified across tamper and timeout; faults refused and campaign continued.\n');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 4 }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
