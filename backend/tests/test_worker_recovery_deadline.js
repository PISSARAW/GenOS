'use strict';

const assert = require('node:assert/strict');
const deadline = require('../src/services/agentRecovery/recoveryDeadline');
assert.equal(deadline.remaining({}, 1000), null);
assert.equal(deadline.remaining({ executionDeadlineAt: 'invalid' }, 1000), 0);
assert.equal(deadline.remaining({ executionDeadlineAt: new Date(3000).toISOString() }, 1000), 2000);
assert.equal(deadline.remaining({ executionDeadlineAt: new Date(1000).toISOString() }, 3000), 0);
console.log('Worker recovery deadline checks passed.');
