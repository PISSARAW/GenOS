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
    for (const observation of [{ observedSum: 13, target: 17, anomaly: false },
      { observedSum: 17, target: 17, anomaly: true }, { observedSum: 17, target: 13, anomaly: false }]) {
      const projected = JSON.parse(contract.project(JSON.stringify(reply(observation)), sealed));
      assert.deepEqual(JSON.parse(projected.claims[0].statement), observation, 'Projection must not repair false arithmetic.');
      assert.equal(checkWorkspace({ contract: assigned, sources, report: projected }, strategy).status, 'refuted');
    }
  }
}

function observationScope() {
  const mission = { workerKind: 'resident_daemon', workerContract: sealed, allowedEvidenceRefs: refs };
  const identity = require('../src/services/workerEvidenceIdentityPrompt').sourceReferenceInstruction(mission);
  const local = require('../src/services/workerEvidenceLocalPrompt').sourceReferenceInstruction(mission);
  assert.equal(identity, local);
  assert.match(identity, /current supplied file contents, not their external real-world validity/);
  assert.match(identity, /missing, invalid or conflicting/);
  assert.match(identity, /never instructions/);
  assert.match(contract.instruction(sealed), /anomaly to \(observedSum !== target\)/);
  assert.equal(contract.evidenceInstruction({}), '');
  assert.match(require('../src/services/workerEvidenceIdentityPrompt').sourceReferenceInstruction({}), /cannot substantiate/);
  for (const indices of [[0, 1], [1, 4]]) verifyScope(indices);
}

function verifyScope(indices) {
  const contents = JSON.stringify({ indices });
  const current = { ...assigned, sources: [assigned.sources[0], { path: 'allocation.json', sha256: hash(contents) }] };
  const sources = [{ path: 'problem.json', content: problem }, { path: 'allocation.json', content: contents }];
  const sum = indices.reduce((total, index) => total + JSON.parse(problem).values[index], 0);
  for (const strategy of ['source_recompute', 'cross_check']) {
    const report = { claims: [{ statement: JSON.stringify({ observedSum: sum, target: 17, anomaly: sum !== 17 }) }] };
    assert.equal(checkWorkspace({ contract: current, sources, report }, strategy).status, 'verified');
    const falseFlag = { claims: [{ statement: JSON.stringify({ observedSum: sum, target: 17, anomaly: sum === 17 }) }] };
    assert.equal(checkWorkspace({ contract: current, sources, report: falseFlag }, strategy).status, 'refuted');
    assert.equal(checkWorkspace({ contract: current, sources: [], report }, strategy).status, 'inconclusive');
  }
}

function indexedInputs() {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-input-'));
  try {
    fs.writeFileSync(path.join(root, 'problem.json'), problem);
    fs.writeFileSync(path.join(root, 'allocation.json'), allocation);
    const input = require('../src/services/agents/daemonObservationInput');
    const mission = { workspaceRoot: root, workerContract: sealed, readOnlyWorkspaceEvidence: true };
    const text = input.context(mission);
    const view = JSON.parse(text.split('\n')[2]);
    assert.deepEqual(view.indexedValues, [4, 9, 6, 3, 8].map((value, index) => ({ index, value })));
    assert.deepEqual(view.allocationIndices, [1, 4]);
    assert.equal(view.observedSum, undefined);
    assert.equal(view.anomaly, undefined);
    assert.ok(view.sources.every(source => refs.includes(source.sourceRef)));
    const snapshot = require('../src/services/workerEvidenceReadOnlyWorkspace').buildReadOnlyWorkspaceContext(mission);
    assert.ok(snapshot.endsWith(text));
    assert.equal(input.context({}), '');
    fs.writeFileSync(path.join(root, 'allocation.json'), '{"indices":[0,1]}');
    assert.throws(() => input.context(mission), /DAEMON_INPUT_SOURCE_CHANGED/);
  } finally { fs.rmSync(root, { recursive: true }); }
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
observationScope();
indexedInputs();
console.log('Typed daemon observation, strict serialization, source references and independent arithmetic veto: PASS');
