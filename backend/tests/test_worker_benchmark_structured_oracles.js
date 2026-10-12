'use strict';

const assert = require('node:assert/strict');
const { CASES } = require('../../benchmarks/workers/cases.cjs');
const adapter = require('../../benchmarks/workers/genos-adapter.cjs');
const { score } = require('../../benchmarks/workers/campaign.cjs');

const KINDS = ['adaptive_worker', 'specialist', 'symbiotic_worker', 'creative_worker',
  'medical_worker', 'recovery_worker', 'liaison_worker', 'sub_orchestrator'];

function tamper(kind, execution) {
  const result = structuredClone(execution);
  if (kind === 'adaptive_worker') result.result.result.makespan -= 1;
  if (kind === 'specialist') result.result.specialtyAssessment.inScope = false;
  if (kind === 'symbiotic_worker') result.result.hostContribution.capability = 'forged';
  if (kind === 'creative_worker') result.result.candidate = 'invented candidate';
  if (kind === 'medical_worker') result.result.evidence = [];
  if (kind === 'recovery_worker') result.observedRestoredContent = 'forged state';
  if (kind === 'liaison_worker') result.result.handoff.recipientAcknowledged = true;
  if (kind === 'sub_orchestrator') result.result.mission.oracle.postconditions[0].status = 'refused';
  return result;
}

async function main() {
  for (const kind of KINDS) {
    const testCase = CASES.find((item) => item.workerKind === kind);
    const execution = await adapter.runCase(testCase);
    assert.equal(execution.status, 'executed', `${kind} should execute`);
    assert.equal(await score(testCase, execution), 'passed', `${kind} independent oracle should pass`);
    assert.equal(await score(testCase, tamper(kind, execution)), 'failed',
      `${kind} independent oracle should reject tampered evidence`);
  }
  console.log('Eight additional worker benchmark oracles pass and reject tampering.');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
