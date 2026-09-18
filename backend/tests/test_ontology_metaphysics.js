'use strict';

const assert = require('assert');
const speculative = require('../src/services/ontology/speculativeRealismService');
const metaphysics = require('../src/services/ontology/metaphysicsService');
const router = require('../src/services/philosophyRouter');

const limit = speculative.analyzeCorrelationLimit({ objectId: 'o1', observerId: 'a1' });
assert.equal(limit.evidence.status, 'unverified');
assert.equal(limit.independentClaim, undefined);
assert.throws(() => speculative.analyzeCorrelationLimit({ observerId: 'a1' }), /objectId/);
assert.equal(metaphysics.compareMindMatterModels({ subjectId: 'a1' }).mappings.length, 5);
assert.equal(metaphysics.compareEmergenceAndElimination({ phenomenon: 'qualia' }).verdict, 'underdetermined');
assert.equal(router.getConcept('school.speculative-realism').status, 'partial');
assert.equal(router.getConcept('metaphysics.panpsychism').status, 'partial');

console.log('Ontology metaphysics tests passed.');
