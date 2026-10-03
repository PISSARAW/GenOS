'use strict';

const assert = require('node:assert/strict');
const { verifySimpleMissionProof } = require('./simpleMissionProof.cjs');
const sessionProbes = require('./session-probes.cjs');
const { installBusyRetry } = require('../../backend/src/db');
const { evaluateQualification } = require('./campaignQualification.cjs');
const { assessTopologyMission, parseWorkerReport } = require('./topologyMissionEvidence.cjs');
const { assessCampaignCapacity, requiredCampaignBytes } = require('./campaignPreflight.cjs');

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

function verifyCampaignStopsBeforeDiskExhaustion() {
  const required = requiredCampaignBytes(3);
  assert.equal(required, 1024 * 1024 * 1024);
  assert.equal(assessCampaignCapacity(required, 3).passed, true);
  const blocked = assessCampaignCapacity(required - 1, 3);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.reason, 'insufficient disk headroom for isolated worker workspaces');
  assert.equal(assessCampaignCapacity(null, 3).passed, false);
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

function verifyTopologyNeedsRealDossiersAndOracle() {
  const workers = [{ status: 'completed', evidenceReport: null }];
  assert.equal(assessTopologyMission({ workers, oracle: { status: 'missing' } }).passed, false);
  workers[0].evidenceReport = parseWorkerReport(JSON.stringify({ evidenceReport: {
    claims: [{ statement: 'Concrete mission result with calculated values and provenance.' }]
  } }));
  assert.equal(assessTopologyMission({ workers, oracle: { status: 'missing' } }).passed, false);
  const verified = assessTopologyMission({ workers, oracle: { status: 'independent', passed: true } });
  assert.equal(verified.passed, true);
  assert.equal(verified.substantiveReportCount, 1);
}

async function verifySessionProbesAreReadOnly() {
  const calls = [];
  const api = { async operateTopologySession(input) {
    calls.push(input.operation);
    if (input.operation === 'snapshot') return { success: true, version: 0, entries: [], graph: { nodes: [], edges: [] }, shared: { sharedFields: {} } };
    if (input.operation === 'history') return { success: true, operations: [] };
    return { success: true, definitions: {}, receipts: [] };
  } };
  const biome = await sessionProbes.probeBiome('session', api);
  const syncytium = await sessionProbes.probeSyncytium('session', api);
  const rhizome = await sessionProbes.probeRhizome('session', api);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((operation) => ['snapshot', 'history', 'invariants'].includes(operation)));
  assert.ok([biome, syncytium, rhizome].every((probe) => probe.verificationEligible === false));
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
  assert.deepEqual(sessionProbes.missingGraphItems(graph, desiredNodes, desiredEdges), {
    nodes: [{ nodeId: 'schema-validator' }],
    edges: [{ edgeId: 'validator-explainer' }]
  });
  await verifyDatabaseRetry();
  verifyCampaignStopsBeforeDiskExhaustion();
  verifyPilotCannotQualifyAsConfirmatory();
  verifyTopologyNeedsRealDossiersAndOracle();
  await verifySessionProbesAreReadOnly();
  process.stdout.write('Campaign root-cause checks passed.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
