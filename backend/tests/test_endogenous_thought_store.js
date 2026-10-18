'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const store = require('../src/services/endogenousThoughtStoreService');

const tenant = { organizationId: 'org-a', projectId: 'project-1' };

function episode(overrides = {}) {
  return {
    transitionId: 'transition-detected', episodeId: 'episode-1', agentId: 'agent-1',
    projectId: 'project-1', mandateRef: 'mandate:1', fromState: null, toState: 'DETECTED',
    triggerRef: 'observation:1', questionRef: null, decisionRef: null, taskRef: null,
    jobRef: null, budget: { tokens: 1000, usd: 0.05, seconds: 30 }, evidenceRefs: [],
    stopReason: null, occurredAt: '2026-10-18T10:00:00.000Z', previousReceiptId: null,
    ...overrides
  };
}

function question(overrides = {}) {
  return {
    questionId: 'question-1', episodeId: 'episode-1', domain: 'runtime',
    text: 'Pourquoi la prédiction diverge-t-elle ?', hypothesis: 'Le signal est périmé.',
    falsifier: 'Une observation fraîche diverge aussi.', method: 'Comparer les observations.',
    expectedEvidence: ['observation fraîche'], expectedInformationGain: 0.7,
    estimatedCost: { tokens: 300, usd: 0.01, seconds: 10 }, risk: 0.1,
    sourceRefs: ['observation:1'], createdAt: '2026-10-18T10:00:01.000Z', ...overrides
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function exerciseStore(db) {
  await db.exec('PRAGMA foreign_keys = ON');
  const started = await store.startEpisode(db, { ...tenant, payload: episode() });
  assert.equal(started.sequence, 0);
  assert.equal(started.replayed, false);
  const replayed = await store.startEpisode(db, { ...tenant, payload: episode() });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.receipt.receiptId, started.receipt.receiptId);
  await expectCode(store.startEpisode(db, { ...tenant,
    payload: episode({ occurredAt: '2026-10-18T10:00:02.000Z' }) }),
  'ENDOGENOUS_TRANSITION_IDEMPOTENCY_CONFLICT');

  const before = await store.listReceipts(db, { ...tenant, episodeId: 'episode-1' });
  await expectCode(store.transitionEpisode(db, { ...tenant, payload: episode({
    transitionId: 'transition-missing-question', fromState: 'DETECTED', toState: 'QUESTIONED',
    questionRef: 'rcpt_missing', previousReceiptId: started.receipt.receiptId
  }) }), 'ENDOGENOUS_QUESTION_NOT_FOUND');
  assert.equal((await store.listReceipts(db, { ...tenant, episodeId: 'episode-1' })).length,
    before.length, 'failed transition must roll back');

  const persistedQuestion = await store.persistQuestion(db, { ...tenant, payload: question() });
  assert.equal(persistedQuestion.replayed, false);
  assert.equal((await store.persistQuestion(db, { ...tenant, payload: question() })).replayed, true);
  await expectCode(store.persistQuestion(db, { ...tenant,
    payload: question({ text: 'Contenu divergent' }) }),
  'ENDOGENOUS_QUESTION_IDEMPOTENCY_CONFLICT');

  const questionedPayload = episode({ transitionId: 'transition-questioned',
    fromState: 'DETECTED', toState: 'QUESTIONED',
    questionRef: persistedQuestion.receipt.receiptId,
    previousReceiptId: started.receipt.receiptId, occurredAt: '2026-10-18T10:00:03.000Z' });
  const questioned = await store.transitionEpisode(db, { ...tenant, payload: questionedPayload });
  assert.equal(questioned.sequence, 1);
  assert.equal((await store.transitionEpisode(db, { ...tenant, payload: questionedPayload })).replayed, true);
  await expectCode(store.transitionEpisode(db, { ...tenant, payload: episode({
    transitionId: 'transition-stale', fromState: 'DETECTED', toState: 'QUESTIONED',
    questionRef: persistedQuestion.receipt.receiptId, previousReceiptId: started.receipt.receiptId
  }) }), 'ENDOGENOUS_STATE_CONFLICT');

  const terminal = await store.transitionEpisode(db, { ...tenant, payload: episode({
    transitionId: 'transition-abstained', fromState: 'QUESTIONED', toState: 'ABSTAINED',
    questionRef: persistedQuestion.receipt.receiptId, stopReason: 'budget insuffisant',
    previousReceiptId: questioned.receipt.receiptId, occurredAt: '2026-10-18T10:00:04.000Z'
  }) });
  assert.equal(terminal.sequence, 2);
  const foreign = { organizationId: 'org-b', projectId: 'project-1' };
  await store.startEpisode(db, { ...foreign, payload: episode() });
  assert.equal((await store.getEpisode(db, { ...foreign, episodeId: 'episode-1' })).currentState,
    'DETECTED');
  await expectCode(store.getEpisode(db, { organizationId: 'org-c', projectId: 'project-1',
    episodeId: 'episode-1' }), 'ENDOGENOUS_EPISODE_NOT_FOUND');
  await assert.rejects(db.run(`UPDATE endogenous_thought_receipts SET to_state='FAILED'
    WHERE organization_id='org-a' AND transition_id='transition-abstained'`), /append-only/);
  await assert.rejects(db.run(`UPDATE endogenous_thought_episodes SET current_state='RUNNING',
    current_receipt_id='forged',version=version+1 WHERE organization_id='org-a'
    AND episode_id='episode-1'`), /transition is invalid/);

  const raceStart = await store.startEpisode(db, { ...tenant, payload: episode({
    transitionId: 'race-start', episodeId: 'episode-race'
  }) });
  const raceQuestionA = await store.persistQuestion(db, { ...tenant, payload: question({
    questionId: 'race-question-a', episodeId: 'episode-race'
  }) });
  const raceQuestionB = await store.persistQuestion(db, { ...tenant, payload: question({
    questionId: 'race-question-b', episodeId: 'episode-race', text: 'Quelle branche est admise ?'
  }) });
  const raceBase = { episodeId: 'episode-race', fromState: 'DETECTED', toState: 'QUESTIONED',
    previousReceiptId: raceStart.receipt.receiptId };
  const competing = await Promise.allSettled([
    store.transitionEpisode(db, { ...tenant, payload: episode({ ...raceBase,
      transitionId: 'race-a', questionRef: raceQuestionA.receipt.receiptId }) }),
    store.transitionEpisode(db, { ...tenant, payload: episode({ ...raceBase,
      transitionId: 'race-b', questionRef: raceQuestionB.receipt.receiptId }) })
  ]);
  assert.equal(competing.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = competing.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'ENDOGENOUS_STATE_CONFLICT');
  assert.equal((await store.listReceipts(db, { ...tenant, episodeId: 'episode-race' })).length, 2);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-endogenous-thought-'));
  const filename = path.join(directory, 'episodes.db');
  let db = openDatabase(filename);
  try {
    await exerciseStore(db);
    await db.close();
    db = openDatabase(filename);
    await db.exec('PRAGMA foreign_keys = ON');
    const restored = await store.getEpisode(db, { ...tenant, episodeId: 'episode-1' });
    assert.equal(restored.currentState, 'ABSTAINED');
    assert.equal(restored.version, 3);
    const receipts = await store.listReceipts(db, { ...tenant, episodeId: 'episode-1' });
    assert.deepEqual(receipts.map((item) => item.sequence), [0, 1, 2]);
    assert.equal(restored.currentReceiptId, receipts[2].receipt.receiptId);
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Endogenous thought durable store tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
