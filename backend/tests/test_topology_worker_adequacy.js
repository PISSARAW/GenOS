'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const topologyKinds = require('../src/services/topologyWorkerKindService');
const workerKinds = require('../src/services/agents/workerKindService');

const EXPECTED_KINDS = ['scout_cell', 'resident_daemon', 'bounded_worker', 'adaptive_worker', 'specialist',
  'procedural_executor', 'symbiotic_worker', 'verifier_worker', 'red_worker', 'experimental_worker',
  'formal_worker', 'synthesis_worker', 'creative_worker', 'medical_worker', 'recovery_worker',
  'forensic_worker', 'liaison_worker', 'teaching_worker', 'sub_orchestrator'];

function readPreferences() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'topologyWorkerKindService.js'), 'utf8');
  const body = source.match(/const ROLE_PREFERENCES = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  return Function(`return ({${body}});`)();
}

function testKindCatalog() {
  assert.deepEqual(Object.keys(workerKinds.KINDS).sort(), [...EXPECTED_KINDS].sort());
  for (const kind of EXPECTED_KINDS) {
    const definition = workerKinds.kindDefinition(kind);
    assert.ok(definition.artifact, `${kind} declares an evidence artifact`);
    assert.ok((workerKinds.KIND_CAPABILITIES[kind] || []).length > 0, `${kind} declares capabilities`);
  }
}

function testPreferenceConsistency() {
  const preferences = readPreferences();
  for (const [capability, kinds] of Object.entries(preferences)) {
    assert.ok(kinds.length > 0, `preference ${capability} is non-empty`);
    for (const kind of kinds) {
      assert.ok(EXPECTED_KINDS.includes(kind), `preference ${capability} lists known kind ${kind}`);
      assert.ok((workerKinds.KIND_CAPABILITIES[kind] || []).includes(capability),
        `preferred kind ${kind} actually carries capability ${capability}`);
    }
  }
}

function selectQuiet(role, methodId, declared) {
  try {
    const member = { role };
    if (methodId) member.methodContract = { version: 1, methodId };
    if (declared) member.workerRequirements = { requiredCapabilities: declared };
    const [mapped] = topologyKinds.applyTopologyWorkerKinds('adequacy-probe', [member]);
    return mapped.workerKind || null;
  } catch (_) {
    return null;
  }
}

function testReachability() {
  const reached = new Map();
  const record = (kind, via) => { if (kind && !reached.has(kind)) reached.set(kind, via); };
  for (const role of Object.keys(topologyKinds.ROLE_REQUIREMENTS)) record(selectQuiet(role), `role:${role}`);
  for (const methodId of Object.keys(workerKinds.METHOD_CAPABILITIES)) {
    record(selectQuiet('implementation', methodId), `method:${methodId}`);
  }
  record(selectQuiet('analyst', 'causal_analysis'), 'method:causal_analysis');
  for (const declared of [['clinical_context'], ['teach'], ['observe', 'execute'], ['coordinate', 'delegate'], ['measure']]) {
    record(selectQuiet(`custom_${declared.join('_')}`, null, declared), `declared:${declared.join(',')}`);
  }
  assert.deepEqual([...reached.keys()].sort(), [...EXPECTED_KINDS].sort());
}

function testPreferenceFirst() {
  assert.equal(selectQuiet('reviewer'), 'verifier_worker');
  assert.equal(selectQuiet('adversarial_reviewer'), 'red_worker');
  assert.equal(selectQuiet('implementation', 'formal_proof'), 'formal_worker');
  assert.equal(selectQuiet('implementation', 'experimental_design'), 'experimental_worker');
  assert.equal(selectQuiet('analyst', 'causal_analysis'), 'forensic_worker');
  assert.equal(selectQuiet('literary_author'), 'creative_worker');
}

function testAdequacySweep() {
  const roles = Object.keys(topologyKinds.ROLE_REQUIREMENTS);
  const methods = [null, ...Object.keys(workerKinds.METHOD_CAPABILITIES)];
  let checked = 0;
  for (const role of roles) {
    for (const methodId of methods) {
      const member = { role };
      if (methodId) member.methodContract = { version: 1, methodId };
      let mapped;
      try {
        [mapped] = topologyKinds.applyTopologyWorkerKinds('adequacy-probe', [member]);
      } catch (error) {
        assert.ok(['WORKER_KIND_CAPABILITY_UNSATISFIED', 'WORKER_METHOD_UNSUPPORTED'].includes(error.code),
          `${role}/${methodId} fails closed, got ${error.code}`);
        continue;
      }
      if (!mapped.workerKind) continue;
      for (const required of mapped.workerAssignment.requiredCapabilities) {
        assert.ok(workerKinds.KIND_CAPABILITIES[mapped.workerKind].includes(required),
          `${role}/${methodId}: ${mapped.workerKind} lacks ${required}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 500, `sweep covers enough assignments (got ${checked})`);
}

testKindCatalog();
testPreferenceConsistency();
testReachability();
testPreferenceFirst();
testAdequacySweep();
console.log('Topology worker adequacy (19 kinds): PASS');
