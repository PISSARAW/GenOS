const assert = require('assert');
const test = require('node:test');
const { hasReachedQuorum, hasBeenRejected } = require('../src/controllers/swarmController');

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
});
