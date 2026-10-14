'use strict';

const assert = require('node:assert/strict');
const { applyDomainVerdict, actionSucceeded } = require('../src/services/mcpExecutor/domainVerdict');

const failed = { success: true, output: '3 tests failed' };
applyDomainVerdict('genos_verify', failed);
assert.equal(failed.domainVerdict, 'failure');
assert.equal(actionSucceeded('genos_verify', failed), false, 'A business failure must not count as a successful action.');

const passed = { success: true, output: 'All checks passed' };
applyDomainVerdict('genos_check', passed);
assert.equal(passed.domainVerdict, 'success');
assert.equal(actionSucceeded('genos_check', passed), true);

const unknown = { success: true, output: 'Command exited with status 0' };
applyDomainVerdict('genos_test', unknown);
assert.equal(unknown.domainVerdict, 'unverified');
assert.equal(actionSucceeded('genos_test', unknown), false, 'An unverified check is not proof of success.');

const transportFailure = { success: false, output: 'ok' };
applyDomainVerdict('genos_test', transportFailure);
assert.equal(transportFailure.domainVerdict, undefined);
assert.equal(actionSucceeded('genos_test', transportFailure), false);
assert.equal(actionSucceeded('genos_fossil_list', { success: true, domainVerdict: 'unverified' }), true,
  'Unverified status on a non-verifier tool does not override transport completion.');

const otherTool = { success: true, output: 'passed' };
applyDomainVerdict('genos_snapshot', otherTool);
assert.equal(otherTool.domainVerdict, undefined);
