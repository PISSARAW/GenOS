'use strict';

const assert = require('assert');
const contracts = require('../src/services/ontology/ontologyContracts');
const personOther = require('../src/services/ontology/personOtherService');
const possibleWorlds = require('../src/services/ontology/possibleWorldService');

assert.deepEqual(contracts.evidence({}), {
  status: 'unverified', sources: [], assumptions: [], limitations: [],
});
assert.throws(() => contracts.text('', 'id'), /id must be a non-empty string/);
assert.throws(() => contracts.evidence({ status: 'invalid' }), /Unknown evidence status/);
assert.throws(() => personOther.defineOther({ subjectId: 'a', otherId: 'a' }), /must differ/);
assert.throws(() => possibleWorlds.addAccessibility({ sourceWorldId: 'a', targetWorldId: 'a' }), /cannot access itself/);
assert.ok(personOther.RELATION_TYPES.includes('other'));
assert.equal(typeof possibleWorlds.createWorld, 'function');

console.log('Operational ontology contract tests passed.');
