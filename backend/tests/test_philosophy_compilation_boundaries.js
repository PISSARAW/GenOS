'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compileRegistry, compileConcept, PILOT_CONTRACTS } = require('../src/philosophy/implementationContracts');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');
const { execute } = require('../src/philosophy/contractRuntime');
const { evaluatePredicate } = require('../src/philosophy/operationalPredicates');

const schemaFile = path.resolve(__dirname, '../../spec/implementation-contract.schema.json');
const readFile = fs.readFileSync;
let reads = 0;
let fault = null;
fs.readFileSync = function instrumentedRead(file, options) {
  if (path.resolve(String(file)) === schemaFile) {
    reads += 1;
    if (fault === 'missing') throw new Error('schema unavailable');
    if (fault === 'invalid') return '{';
  }
  return readFile.call(this, file, options);
};

try {
  const first = compileRegistry(CONCEPT_DEFINITIONS);
  assert.equal(first.valid, true, first.errors.join('; '));
  assert.equal(first.contracts.length, 375);
  assert.equal(reads, 1, 'one fresh schema read per compilation');
  assert.deepEqual(compileRegistry(CONCEPT_DEFINITIONS), first);
  assert.equal(reads, 2, 'schema must not be cached across compilations');
  fault = 'missing';
  const missing = compileRegistry(CONCEPT_DEFINITIONS);
  assert.equal(missing.valid, false);
  assert.equal(missing.errors.length, 375);
  assert.ok(missing.errors.every((error) => error.includes('schema unavailable')));
  fault = 'invalid';
  assert.equal(compileRegistry(CONCEPT_DEFINITIONS).valid, false);
  fault = null;
  assert.equal(compileRegistry(CONCEPT_DEFINITIONS).valid, true);

  for (const contract of first.contracts) {
    const source = contract.source?.sourceDocument || contract.id;
    assert.ok(contract.sourceRefs.includes(source), `source lost: ${contract.id}`);
    assert.equal(contract.runtimeAuthority, false);
  }
  for (const pilot of PILOT_CONTRACTS) {
    const contract = first.contracts.find((entry) => entry.id === pilot.id);
    for (const test of pilot.falsificationTests) assert.ok(contract.falsificationTests.includes(test));
    for (const prohibition of pilot.prohibitions) assert.ok(contract.prohibitions.includes(prohibition));
  }
  const concept = CONCEPT_DEFINITIONS.find((entry) => entry.id === 'epistemology.certainty-doubt');
  const contract = compileConcept(concept);
  assert.equal(evaluatePredicate('multiple', [{ agent: 'same' }, { agent: 'same' }]).status, 'violated');
  assert.equal(evaluatePredicate('multiple', [{ agent: 'first' }, { agent: 'second' }]).status, 'satisfied');
  assert.throws(() => execute({ ...contract, execution: { ...contract.execution, apiVersion: 'unsupported' } }), /unsupported execution/);
  for (const value of [null, false, 0, '', []]) {
    assert.throws(() => execute(contract, { observations: value }), /object required/);
    assert.throws(() => execute(contract, { state: value }), /object required/);
  }
  assert.equal(execute(contract).assessment.status, 'unobserved');
  const fullState = { padding: 'a'.repeat(128 * 1024 - Buffer.byteLength(JSON.stringify({ padding: '' }))) };
  assert.equal(Buffer.byteLength(JSON.stringify(fullState)), 128 * 1024);
  assert.throws(() => execute(contract, { state: fullState }), /budget exceeded/);
  assert.deepEqual(execute(contract, { state: fullState, enabled: false }).after, fullState);
  console.log('375 contracts preserve sources and planned probes; fresh batch schema and typed inputs fail closed.');
} finally {
  fs.readFileSync = readFile;
}
