'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const contract = require('../src/services/agents/daemonObservationContract');
const { workerResponseFormat } = require('../src/services/workerEvidenceIdentityPrompt');
const { artifactInstruction } = require('../src/services/agents/workerArtifactInstructions');
const { checkWorkspace } = require('../src/services/epistemic/oracleWorkspaceChecks');
const artifact = require('../src/services/workerEvidenceLocalArtifact');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const problem = JSON.stringify({ values: [4, 9, 6, 3, 8], target: 17 });
const allocation = JSON.stringify({ indices: [1, 4] });
const assigned = { version: 1, kind: 'resource_allocation', mode: 'observation', indexBase: 0,
  files: { problem: 'problem.json', allocation: 'allocation.json' }, sources: [
    { path: 'problem.json', sha256: hash(problem) }, { path: 'allocation.json', sha256: hash(allocation) }
  ] };
const sealed = { identity: { workerKind: 'resident_daemon' },
  assignment: { workspaceVerificationContract: assigned }, evidence: { requiredArtifacts: ['dossier'] } };
const refs = assigned.sources.map(source => `sha256:${source.sha256}`);

function reply(observation = { observedSum: 17, target: 17, anomaly: false }) {
  return { schema: contract.FORMAT, outcome: 'success', observation, evidence: refs, uncertainties: [],
    territoryReport: { territoryId: 'allocation.json', observedAt: '2026-11-04T12:00:00.000Z', sourceRefs: refs } };
}

function assertRefused(value) {
  assert.throws(() => contract.project(JSON.stringify(value), sealed), error => error.code === 'INVALID_DAEMON_OBSERVATION');
}

function refusals() {
  assertRefused({ outcome: 'success', claims: [{ statement: 'observedSum:27,target:17,anomaly:true', evidence: refs }] });
  assertRefused({ ...reply(), claims: [{ statement: 'extra', evidence: refs }] });
  assertRefused({ ...reply(), observation: JSON.stringify(reply().observation) });
  assertRefused(reply({ observedSum: '17', target: 17, anomaly: false }));
  assertRefused(reply({ observedSum: 17, target: 17, anomaly: 'false' }));
  assertRefused({ ...reply(), evidence: ['mission'] });
  assertRefused({ ...reply(), evidence: [refs[0], refs[0]] });
  assertRefused({ ...reply(), territoryReport: { ...reply().territoryReport, territoryId: 'other' } });
  assertRefused({ ...reply(), territoryReport: { ...reply().territoryReport, observedAt: 'invented' } });
  assertRefused({ schema: contract.FORMAT, outcome: 'unresolved', observation: null, uncertainties: [] });
  assert.throws(() => contract.project('```json\n' + JSON.stringify(reply()) + '\n```', sealed), /strict JSON/);
}

function semanticVeto() {
  const sources = [{ path: 'problem.json', content: problem }, { path: 'allocation.json', content: allocation }];
  for (const strategy of ['source_recompute', 'cross_check']) {
    const good = JSON.parse(contract.project(JSON.stringify(reply()), sealed));
    assert.equal(checkWorkspace({ contract: assigned, sources, report: good }, strategy).status, 'verified');
    const wrong = reply({ observedSum: 27, target: 17, anomaly: true });
    const projected = JSON.parse(contract.project(JSON.stringify(wrong), sealed));
    assert.deepEqual(JSON.parse(projected.claims[0].statement), wrong.observation, 'Projection must not repair false arithmetic.');
    assert.equal(checkWorkspace({ contract: assigned, sources, report: projected }, strategy).status, 'refuted');
  }
}

function integration() {
  const text = JSON.stringify(reply());
  const report = JSON.parse(contract.project(text, sealed));
  assert.equal(report.claims.length, 1);
  assert.equal(report.daemonObservation.sourceTextSha256, hash(text));
  const mission = { workerKind: 'resident_daemon', workerContract: sealed, allowedEvidenceRefs: refs };
  assert.equal(workerResponseFormat(mission).name, 'genos_daemon_allocation_observation');
  assert.match(artifactInstruction(sealed), /healthy allocation must have anomaly false/);
  artifact.attachFullText(report, { text });
  artifact.attachWorkerArtifact(report, { mission, result: { text } });
  assert.equal(report.fullText, text);
  assert.deepEqual(JSON.parse(report.workerArtifact.content.claims[0].statement), reply().observation);
  const unresolved = JSON.parse(contract.project(JSON.stringify({ schema: contract.FORMAT,
    outcome: 'unresolved', observation: null, uncertainties: ['Missing source.'] }), sealed));
  assert.deepEqual(unresolved.claims, []);
  assert.equal(unresolved.outcome, 'unresolved');
  assert.equal(workerResponseFormat({ workerKind: 'resident_daemon' }).name, 'genos_worker_artifact');
  const other = { ...sealed, identity: { workerKind: 'specialist' } };
  assert.equal(contract.project(text, other), text);
  assert.equal(contract.responseFormat({ ...sealed, assignment: { workspaceVerificationContract: { ...assigned, mode: 'candidate' } } }), null);
}

refusals();
semanticVeto();
integration();
console.log('Typed daemon observation, strict serialization, source references and independent arithmetic veto: PASS');
