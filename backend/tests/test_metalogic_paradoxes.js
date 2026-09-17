'use strict';
const assert = require('node:assert/strict');
const metalogic = require('../src/services/metalogicService');
const paradox = require('../src/services/paradoxAnalysisService');
assert.equal(metalogic.analyzeSelfReference({ sentence: 'Cette phrase dit sa propre vérité.' }).requiresMetaLanguage, true);
assert.deepEqual(paradox.analyze({ type: 'liar' }).solutions, ['hierarchy', 'fixed-point', 'paraconsistent']);
console.log('metalogic/paradoxes: ok');
