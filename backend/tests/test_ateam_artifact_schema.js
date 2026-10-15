'use strict';

const assert = require('node:assert/strict');
const { validateSchema, validateArtifact } = require('../src/services/aTeam/variants/artifactSchemaService');

const safePattern = { type: 'string', pattern: '^[a-z]+$' };
assert.deepEqual(validateSchema(safePattern), []);
assert.deepEqual(validateArtifact('genos', safePattern), []);
assert.notDeepEqual(validateArtifact('GenOS', safePattern), []);
assert.notDeepEqual(validateSchema({ type: 'string', pattern: '(a+)+$' }), []);
assert.notDeepEqual(validateSchema({ type: 'string', pattern: '(a|aa)+$' }), []);
assert.notDeepEqual(validateSchema({ type: 'string', pattern: 'a{1,2,3}' }), []);
assert.notDeepEqual(validateSchema({ type: 'string', pattern: 'a'.repeat(257) }), []);
assert.notDeepEqual(validateArtifact('value', { type: 'string', pattern: '(a+)+$' }), []);
console.log('A-Team artifact schema pattern safety passed.');
