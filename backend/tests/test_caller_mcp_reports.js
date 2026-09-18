const assert = require('node:assert/strict');
const { validateCallerReport } = require('../bin/caller-mcp-context.cjs');
const { analyzeMission } = require('../src/services/aTeamService');
const { classifyProblem } = require('../src/strategies/strategySelector');
const { buildExecutionBudget } = require('../src/services/agentFleetWorkers');

assert.throws(() => validateCallerReport('plain story'), SyntaxError);
assert.throws(() => validateCallerReport('{"author":{"name":"host"}}'), /explicit outcome/);
assert.throws(() => validateCallerReport('{"outcome":"success","claims":[]}'), /claims/);
assert.throws(() => validateCallerReport(JSON.stringify({ outcome: 'success', claims: [{}], artifact: 'creative' })), /artifactText/);
assert.equal(validateCallerReport('{"outcome":"failed"}').outcome, 'failed');
const fiction = analyzeMission('Écris une courte histoire littéraire en français.');
assert.equal(fiction.primaryDomain, 'creative_writing');
assert.equal(fiction.members.length, 3);
assert.equal(classifyProblem('Écris une courte histoire littéraire en français.'), 'creative_writing');
const budgets = [0, 1].map((index) => buildExecutionBudget({ executionBudget: { costUsd: 1, events: 100 }, index, assignmentCount: 2, assignedTokens: 9000 }));
assert.deepEqual(budgets.map((budget) => budget.costUsd), [0.5, 0.5]);
assert.equal(budgets.reduce((total, budget) => total + budget.costUsd, 0), 1);
console.log('Caller MCP report and creative classification tests passed.');
