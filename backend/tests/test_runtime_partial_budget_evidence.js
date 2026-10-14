'use strict';

const assert = require('node:assert/strict');
const { fromBudgetStop } = require('../bin/agent-runtime-partial-report.cjs');

const budgetStop = { dimension: 'tokens', observed: 9_000, limit: 8_000 };
const report = fromBudgetStop({
  finalReportText: JSON.stringify({ outcome: 'success', claims: [
    { statement: 'Peer identity was observed.', evidence: ['message-17'] }
  ], uncertainties: ['Acknowledgment was not observed.'], tests: [] }),
  agentName: 'Witness',
  nameMeaning: 'Identity witness',
  mission: { role: 'witness' }
}, budgetStop);

assert.equal(report.partial, true);
assert.equal(report.outcome, 'partial');
assert.equal(report.reportedOutcome, 'success');
assert.equal(report.claims[0].evidence[0], 'message-17');
assert.deepEqual(report.budgetStop, budgetStop);
assert.equal(fromBudgetStop({ finalReportText: '' }, budgetStop), null);

console.log('Runtime partial budget evidence: PASS');
