'use strict';

const assert = require('node:assert/strict');
const { applyDomainVerdict } = require('../src/services/mcpExecutor/domainVerdict');

const failed = { success: true, output: '3 tests failed' };
applyDomainVerdict('genos_verify', failed);
assert.equal(failed.domainVerdict, 'failure');

const passed = { success: true, output: 'All checks passed' };
applyDomainVerdict('genos_check', passed);
assert.equal(passed.domainVerdict, 'success');

const unknown = { success: true, output: 'Command exited with status 0' };
applyDomainVerdict('genos_test', unknown);
assert.equal(unknown.domainVerdict, 'unverified');

const transportFailure = { success: false, output: 'ok' };
applyDomainVerdict('genos_test', transportFailure);
assert.equal(transportFailure.domainVerdict, undefined);

const otherTool = { success: true, output: 'passed' };
applyDomainVerdict('genos_snapshot', otherTool);
assert.equal(otherTool.domainVerdict, undefined);
