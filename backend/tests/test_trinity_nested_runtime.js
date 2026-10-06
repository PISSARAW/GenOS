'use strict';
const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const nested = require('../src/services/trinityNestedMissionRunner');
const recursive = require('../src/services/trinityRecursiveExecutor');
const budget = require('../src/services/trinityBudgetPolicy');
async function main() {
  const selection = { experimentalDesign: { worldTopology: 'recursive_nesting' }, recursiveState: { depth: 0 } };
  const allocation = budget.allocate({ executionBudget: { tokens: 1000 } }, 3, selection);
  assert.equal(allocation.reservedTokens, 300);
  assert.equal(budget.initialWorkerPool({ total: 1000, workerShare: 0.6 }, selection), 300);
  assert.equal(300 + allocation.reservedTokens + 400, 1000);
  assert.ok(allocation.perChamberTokens.reduce((sum, tokens) => sum + tokens, 0) + 300 <= 1000);
  assert.throws(() => budget.recursiveReserve({ ...selection, recursiveBudgetTokens: 500 }, 1000), { code: 'TRINITY_RECURSIVE_BUDGET_REQUIRED' });
  assert.equal(budget.recursiveReserve({ ...selection, recursiveState: { depth: 3 } }, 1000), 0);
  const payload = nested.missionPayload({ childId: 'child', missionId: 'mission', mission: 'work', tokens: 300,
    depth: 2, spentBudget: 0.24, parentProblemIds: ['parent-problem'] });
  assert.deepEqual(payload.execution_budget, { tokens: 300 });
  assert.deepEqual(payload.recursiveParentProblemIds, ['parent-problem']);
  assert.equal(nested.acceptedFrom(JSON.stringify({ orchestratorId: 'child', trinity: { missionId: 'mission', status: 'accepted' } }), 'mission').status, 'accepted');
  assert.throws(() => nested.acceptedFrom(JSON.stringify({ trinity: { missionId: 'other', status: 'accepted' } }), 'mission'));
  assert.equal(recursive.shouldRecurse({ subProblem: { id: 'problem', criteria: [] }, spentBudget: 0.24 }).reason, 'budget_exhausted');
  const report = { claims: [], uncertainties: ['Same unresolved question'] };
  assert.equal(recursive.identifySubProblems(report)[0].id, recursive.identifySubProblems(report)[0].id);
  const subproblem = recursive.identifySubProblems(report)[0];
  assert.equal(recursive.shouldRecurse({ subProblem: subproblem, config: { parentProblemIds: [subproblem.id] } }).reason, 'cycle_detected');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT, execution_mode TEXT, model_tier TEXT, isolation_mode TEXT, current_task TEXT, parent_agent_id TEXT, lineage_relation TEXT, cognitive_budget REAL, cognitive_baseline_budget REAL, workspace_id TEXT)');
    await db.run('INSERT INTO agents (id, cognitive_budget) VALUES (?, ?)', 'parent', 200);
    const child = { childId: 'child', parentAgentId: 'parent', mission: 'same mission' };
    assert.equal(await nested.createChildOrchestrator(db, child), true);
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'parent')).cognitive_budget, 140);
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'child')).cognitive_budget, 60);
    assert.equal(await nested.createChildOrchestrator(db, child), false);
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'parent')).cognitive_budget, 140);
    await assert.rejects(nested.createChildOrchestrator(db, { ...child, mission: 'different mission' }), { code: 'TRINITY_NESTED_ID_CONFLICT' });
    await db.run('INSERT INTO agents (id, cognitive_budget) VALUES (?, ?)', 'empty', 0);
    await assert.rejects(nested.createChildOrchestrator(db, { childId: 'unfunded', parentAgentId: 'empty', mission: 'work' }), { code: 'TRINITY_NESTED_BUDGET_REQUIRED' });
    assert.equal(await db.get('SELECT id FROM agents WHERE id = ?', 'unfunded'), undefined);
  } finally { await db.close(); }
  console.log('Trinity recursive token reserve, actual acceptance envelope, lineage and atomic cognitive debit: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
