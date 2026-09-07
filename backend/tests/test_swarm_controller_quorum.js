const assert = require('assert');
const test = require('node:test');
const { hasReachedQuorum, hasBeenRejected, getActiveNodeCount } = require('../src/controllers/swarmController');
const { getDatabase } = require('../src/db');

test('swarmController quorum and abstention semantics', async (t) => {
  await t.test('abstention counts toward turnout but does not penalize approval rate', () => {
    // 10 active nodes, 50% turnout threshold = 5 votes required. Approval threshold = 0.60.
    // Case A: 3 yes, 2 abstain (5 total votes). validVotes = 3. yesCount / validVotes = 3/3 = 100% >= 60%
    const passedWithAbstention = hasReachedQuorum(3, 0, 5, 10, 0.60);
    assert.strictEqual(passedWithAbstention, true, 'Quorum should be reached when turnout is met and approval is 100%');

    // Case B: 3 yes, 2 no (5 total votes). validVotes = 5. yesCount / validVotes = 3/5 = 60% >= 60%
    const passedAtThreshold = hasReachedQuorum(3, 2, 5, 10, 0.60);
    assert.strictEqual(passedAtThreshold, true);

    // Case C: 2 yes, 3 no (5 total votes). validVotes = 5. yesCount / validVotes = 40% < 60%
    const failedRejected = hasReachedQuorum(2, 3, 5, 10, 0.60);
    assert.strictEqual(failedRejected, false);

    // If abstention counted as a NO (the old bug):
    // 3 yes, 0 no, 2 abstain would have been 3 / 5 = 60%, and 2 yes, 1 no, 2 abstain would have failed (2/5=40%) even though yes/(yes+no) = 66%!
    // With fix: 2 yes, 1 no, 2 abstain (5 total votes). validVotes = 3. yes/validVotes = 2/3 = 66.7% >= 60%
    const passedWithAbstentionsAndNo = hasReachedQuorum(2, 1, 5, 10, 0.60);
    assert.strictEqual(passedWithAbstentionsAndNo, true);
  });

  await t.test('hasReachedQuorum requires participation threshold', () => {
    // 10 active nodes, 50% turnout = 5 votes required. Only 4 total votes received (4 yes, 0 no).
    const notEnoughTurnout = hasReachedQuorum(4, 0, 4, 10, 0.60);
    assert.strictEqual(notEnoughTurnout, false);
  });

  await t.test('getActiveNodeCount filters by workspace and includes idle/ready agents', async () => {
    const db = await getDatabase();
    const ws1 = `ws-test-${Date.now()}-1`;
    const ws2 = `ws-test-${Date.now()}-2`;
    await db.run("INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)", ws1, `ws-name-${ws1}`, `/path/${ws1}`);
    await db.run("INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)", ws2, `ws-name-${ws2}`, `/path/${ws2}`);

    // Insert agents in ws1: 1 running, 1 idle, 1 Active, 1 terminated
    await db.run("INSERT INTO agents (id, name, workspace_id, status, role) VALUES (?, 'a1', ?, 'running', 'worker')", `ag-1-${Date.now()}`, ws1);
    await db.run("INSERT INTO agents (id, name, workspace_id, status, role) VALUES (?, 'a2', ?, 'idle', 'worker')", `ag-2-${Date.now()}`, ws1);
    await db.run("INSERT INTO agents (id, name, workspace_id, status, role) VALUES (?, 'a3', ?, 'Active', 'worker')", `ag-3-${Date.now()}`, ws1);
    await db.run("INSERT INTO agents (id, name, workspace_id, status, role) VALUES (?, 'a4', ?, 'terminated', 'worker')", `ag-4-${Date.now()}`, ws1);

    // Insert agents in ws2: 2 running
    await db.run("INSERT INTO agents (id, name, workspace_id, status, role) VALUES (?, 'b1', ?, 'running', 'worker')", `bg-1-${Date.now()}`, ws2);
    await db.run("INSERT INTO agents (id, name, workspace_id, status, role) VALUES (?, 'b2', ?, 'running', 'worker')", `bg-2-${Date.now()}`, ws2);

    const countWs1 = await getActiveNodeCount(db, ws1, null);
    assert.strictEqual(countWs1, 3, 'Should count 3 active/idle/ready agents in ws1, excluding terminated');

    const countWs2 = await getActiveNodeCount(db, ws2, null);
    assert.strictEqual(countWs2, 2, 'Should count 2 agents in ws2 without leakage from ws1');
  });

  await t.test('hasBeenRejected detects mathematically impossible approval', () => {
    // 10 active nodes, approvalThreshold = 0.60
    // Case 1: 0 yes, 5 no, 5 total votes out of 10 nodes. Remaining votes = 5.
    // Max possible yes = 5. Max possible valid = 10. Max approval = 5/10 = 50% < 60% -> REJECTED!
    const rejected = hasBeenRejected(0, 5, 5, 10, 0.60);
    assert.strictEqual(rejected, true);

    // Case 2: 3 yes, 2 no, 5 total votes out of 10 nodes. Remaining = 5.
    // Max possible yes = 8. Max valid = 10. Max approval = 80% >= 60% -> NOT rejected yet.
    const notYetRejected = hasBeenRejected(3, 2, 5, 10, 0.60);
    assert.strictEqual(notYetRejected, false);
  });
});
