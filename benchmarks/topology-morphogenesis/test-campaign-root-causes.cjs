'use strict';

const assert = require('node:assert/strict');
const { verifySimpleMissionProof } = require('./simpleMissionProof.cjs');
const { missingGraphItems } = require('./session-probes.cjs');
const { installBusyRetry } = require('../../backend/src/db');
const { evaluateQualification } = require('./campaignQualification.cjs');

function receiptFor(statement) {
  return { telemetry: [{ event_type: 'EVIDENCE_REPORT', payload_json: JSON.stringify({
    evidenceReport: { claims: [{ statement }] }
  }) }] };
}

async function verifyDatabaseRetry() {
  const db = { attempts: 0, async run() {
    this.attempts += 1;
    if (this.attempts === 1) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    return 'saved';
  } };
  installBusyRetry(db);
  assert.equal(await db.run('INSERT'), 'saved');
  assert.equal(db.attempts, 2);
}

function verifyPilotCannotQualifyAsConfirmatory() {
  const suite = { status: 'protocol', controls: { repetitions: { pilot: 1, confirmatory: 3 } } };
  const pilot = evaluateQualification({ suite, performedRepetitions: 1, sourceClean: true, verificationPassed: true });
  assert.equal(pilot.status, 'pilot');
  assert.equal(pilot.confirmatoryEligible, false);
  assert.equal(pilot.repetitions.confirmatory.complete, false);
  assert.ok(pilot.blockers.includes('suite_not_confirmatory'));

  const confirmatory = evaluateQualification({ suite: { ...suite, status: 'confirmatory' },
    performedRepetitions: 3, sourceClean: true, verificationPassed: true });
  assert.equal(confirmatory.status, 'confirmatory');
  assert.equal(confirmatory.confirmatoryEligible, true);
  const dirty = evaluateQualification({ suite: { ...suite, status: 'confirmatory' },
    performedRepetitions: 3, sourceClean: false, verificationPassed: true });
  assert.equal(dirty.confirmatoryEligible, false);
}

async function main() {
  const latex = '24 - 3 = 21; 21 \\div 7 = 3; 21 \\mod 7 = 0; il n’y a pas de reste.';
  const proof = verifySimpleMissionProof(receiptFor(latex), 'orchestrateur-simple');
  assert.equal(proof.verified, true);
  assert.equal(verifySimpleMissionProof(receiptFor(latex.replace('= 0', '= 1')),
    'orchestrateur-simple').verified, false);

  const graph = {
    nodes: [{ nodeId: 'json-parser' }],
    edges: [{ edgeId: 'parser-validator' }]
  };
  const desiredNodes = [{ nodeId: 'json-parser' }, { nodeId: 'schema-validator' }];
  const desiredEdges = [{ edgeId: 'parser-validator' }, { edgeId: 'validator-explainer' }];
  assert.deepEqual(missingGraphItems(graph, desiredNodes, desiredEdges), {
    nodes: [{ nodeId: 'schema-validator' }],
    edges: [{ edgeId: 'validator-explainer' }]
  });
  await verifyDatabaseRetry();
  verifyPilotCannotQualifyAsConfirmatory();
  process.stdout.write('Campaign root-cause checks passed.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
