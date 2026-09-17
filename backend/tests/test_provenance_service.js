'use strict';

const assert = require('assert');
const { createRecord, nextVersion, validateChain } = require('../src/services/philosophy/provenanceService');

const record = createRecord({
  recordId: 'prov-1',
  subject: { kind: 'PhilosophicalConcept', id: 'language.sense' },
  sourceType: 'primary', sourceDocument: 'Sinn und Bedeutung', sourceLocator: '§1',
  evidenceStatus: 'documented', interpretationStatus: 'conceptual'
});
assert.equal(record.apiVersion, 'genos.provenance/v1');
assert.equal(nextVersion('1.2.3'), '1.2.4');
assert.equal(validateChain([record]).valid, true);
assert.equal(validateChain([{ ...record, recordId: 'prov-2', derivedFrom: ['missing'] }]).valid, false);
assert.throws(() => nextVersion('1.0'), /MAJOR.MINOR.PATCH/);

console.log('Provenance service tests passed.');
