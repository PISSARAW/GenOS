'use strict';
const assert = require('assert');
const { validateRegistration, factorialCompare } = require('../src/services/noReportAblationService');
assert.strictEqual(validateRegistration({ protocolId: 'p23', factors: ['workspace', 'meta'] }).preregistered, true);
const result = factorialCompare([{ id: 'a', factors: { workspace: true }, behavior: { task: 1 }, textClaims: ['x'] }, { id: 'b', factors: { workspace: false }, behavior: { task: 0 }, textClaims: ['invented'] }]);
assert.strictEqual(result.independentOfReportText, true);
assert.strictEqual(result.effects.workspace, 1);
console.log('✅ no-report ablation tests passed');
