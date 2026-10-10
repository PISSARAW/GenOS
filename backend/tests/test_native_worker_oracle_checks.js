'use strict';
const assert = require('node:assert/strict');
const { fixtures } = require('./helpers/nativeWorkerFixtures');
const { reportFor } = require('../src/services/agents/workerDeterministicReports');
const scout = require('../src/services/agents/deterministicWorkerScout');
const monitor = require('../src/services/agents/deterministicWorkerMonitor');
const synthesis = require('../src/services/agents/deterministicWorkerSynthesis');
const forensic = require('../src/services/agents/deterministicWorkerForensic');
const coordination = require('../src/services/agents/workerCoordinationExecutor');
const candidates = require('../src/services/agents/workerCandidateExecutor');
const verifier = require('../src/services/agents/deterministicWorkerVerifier');
const red = require('../src/services/agents/deterministicWorkerRed');
const experiment = require('../src/services/agents/deterministicWorkerExperiment');
const values = require('../src/services/trinityProvenanceValues');
const { STRATEGIES, checkWorker } = require('../src/services/epistemic/oracleWorkerChecks');

const input = fixtures('D:/GenOS-attention-tests/oracle-checks');
const cases = [
  ['scout_cell', scout.runScout],
  ['resident_daemon', monitor.runMonitor],
  ['synthesis_worker', synthesis.runSynthesis],
  ['forensic_worker', forensic.runForensic],
  ['liaison_worker', coordination.runHandoff],
  ['medical_worker', candidates.runClinical],
  ['creative_worker', candidates.runCandidates],
  ['experimental_worker', experiment.runExperiment],
  ['verifier_worker', verifier.runVerification],
  ['red_worker', red.runRed]
];
for (const [kind, execute] of cases) {
  const method = JSON.parse(values.encode(input[kind]));
  const artifact = JSON.parse(values.encode(reportFor(kind, execute(input[kind])).workerArtifact));
  for (const strategy of STRATEGIES) {
    assert.equal(checkWorker({ method, artifact }, strategy).status, 'verified');
  }
  const changed = structuredClone(artifact);
  if (kind === 'scout_cell') {
    changed.content.observations[0].offset += 1;
    const { scoutReceipt, ...content } = changed.content;
    changed.content.scoutReceipt.id = `solver://sha256:${values.digest({ methodContract: method, content })}`;
  } else if (kind === 'resident_daemon') {
    changed.content.anomalies[0].value += 1;
    changed.content.monitorReceipt.id = `solver://sha256:${values.digest({ methodContract: method,
      anomalies: changed.content.anomalies, territoryReport: changed.content.territoryReport })}`;
  } else if (kind === 'synthesis_worker') {
    changed.content.disagreements[0].claim = 'Incorrect';
    const { synthesisReceipt, ...content } = changed.content;
    changed.content.synthesisReceipt.id = `solver://sha256:${values.digest({ methodContract: method, content })}`;
  } else if (kind === 'forensic_worker') {
    changed.content.causalChain[0].to = 'Incorrect';
    const { forensicReceipt, ...content } = changed.content;
    changed.content.forensicReceipt.id = `solver://sha256:${values.digest({ methodContract: method, content })}`;
  } else if (kind === 'liaison_worker') {
    changed.content.handoff.targetGroup = 'Incorrect';
    const inputDigest = values.digest(method);
    const receiptId = `solver://sha256:${values.digest({ inputDigest,
      output: { handoff: changed.content.handoff } })}`;
    changed.content.claims[0].evidence[0] = receiptId;
    changed.provenance.sourceRefs[0] = receiptId;
  } else if (kind === 'medical_worker') {
    changed.content.differentialConsiderations[0] = 'Incorrect';
    const inputDigest = values.digest(method);
    changed.provenance.sourceRefs[0] = `solver://sha256:${values.digest({ inputDigest,
      output: changed.content })}`;
  } else if (kind === 'creative_worker') {
    changed.content.candidate = changed.content.alternatives[0];
    const inputDigest = values.digest(method);
    changed.provenance.sourceRefs[0] = `solver://sha256:${values.digest({ inputDigest,
      output: changed.content })}`;
  } else if (kind === 'experimental_worker') {
    changed.content.conclusion = 'Incorrect';
  } else {
    changed.content.verdict = changed.content.verdict === 'reject' ? 'accept' : 'reject';
  }
  assert.equal(checkWorker({ method, artifact: changed }, 'worker_integrity').status, 'verified');
  assert.equal(checkWorker({ method, artifact: changed }, 'worker_reference').status, 'refuted');
}
console.log('Native worker oracle rejects semantically false results even with matching receipt hashes.');
