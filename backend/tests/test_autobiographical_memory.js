const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'autobio-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const { computeSalience, DEFAULT_SALIENCE_THRESHOLD } = require('../src/services/autobiographicalMemory/salience');
const { captureTelemetryEvent, resolveKind } = require('../src/services/autobiographicalMemory/captureService');
const episodeStore = require('../src/services/autobiographicalMemory/episodeStore');
const lessonService = require('../src/services/autobiographicalMemory/lessonService');
const recallService = require('../src/services/autobiographicalMemory/recallService');

function testSalience() {
  const failure = computeSalience({ eventType: 'AGENT_FAILED', payload: { status: 'failed', cost: { tokens: 6000 } } });
  assert(failure.salience >= DEFAULT_SALIENCE_THRESHOLD, 'a costly failure event must clear the salience threshold');
  const trivialStep = computeSalience({ eventType: 'AGENT_STEP', payload: {} });
  assert(trivialStep.salience < DEFAULT_SALIENCE_THRESHOLD, 'a plain step with no signal must not become a memory');
  const highRisk = computeSalience({ eventType: 'AGENT_STEP', payload: { risk: 0.9, cost: { tokens: 6000 } } });
  assert(highRisk.signals.highRisk === 1 && highRisk.signals.highCost === 1, 'risk/cost signals must be detected');
  assert.equal(resolveKind('AGENT_FAILED'), 'primitive_failure');
  assert.equal(resolveKind('UNKNOWN_EVENT_TYPE'), null);
}

async function testCaptureAndForget(db) {
  const salient = await captureTelemetryEvent({
    eventType: 'AGENT_FAILED',
    agentId: 'orchestrator_01',
    timestamp: new Date().toISOString(),
    payload: { missionId: 'mission_1', status: 'failed', reason: 'primitive lacked evidence', cost: { tokens: 6000 } }
  }, db);
  assert(salient, 'a failure event should be captured as an episode');
  assert.equal(salient.kind, 'primitive_failure');

  const droppedTrivial = await captureTelemetryEvent({ eventType: 'AGENT_STEP', agentId: 'orchestrator_01', payload: {} }, db);
  assert.equal(droppedTrivial, null, 'low-salience events must not become episodes');

  const old = await episodeStore.recordEpisode({
    agentId: 'orchestrator_01', missionId: 'mission_0', kind: 'step', salience: 0.1,
    timestamp: new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString()
  }, db);
  const forgotten = await episodeStore.forgetStaleEpisodes({}, db);
  assert(forgotten.forgottenCount >= 1, 'old low-salience episodes must be forgotten');
  const recent = await episodeStore.getRecentEpisodes({ agentId: 'orchestrator_01' }, db);
  assert(!recent.some((episode) => episode.id === old.id), 'forgotten episodes must not surface in recall');
}

async function testLessonConsolidationAndRecall(db) {
  const baseEpisode = (status, i) => ({
    agentId: 'orchestrator_01',
    missionId: `mission_${i}`,
    kind: 'strategy_change',
    salience: 0.6,
    situation: { goal: 'fix failing orchestration test' },
    decision: { selectedStrategy: 'falsification_forks' },
    outcome: { status },
    timestamp: new Date().toISOString()
  });
  await episodeStore.recordEpisode(baseEpisode('success', 1), db);
  await episodeStore.recordEpisode(baseEpisode('success', 2), db);

  const lessons = await lessonService.consolidateLessons({ agentId: 'orchestrator_01' }, db);
  assert(lessons.length >= 1, 'repeated successes must consolidate into at least one lesson');
  const lesson = lessons.find((l) => l.scope === 'strategy_change');
  assert(lesson, 'a strategy_change lesson must be produced');
  assert.equal(lesson.recommendedAction, 'reuse_strategy_first');
  assert(lesson.confidence > 0.5 && lesson.confidence <= 0.95);

  const stored = await lessonService.getLessons({ scope: 'strategy_change' }, db);
  assert(stored.some((l) => l.id === lesson.id), 'consolidated lesson must be persisted and retrievable');

  const recall = await recallService.recallForSituation(
    { agentId: 'orchestrator_01', kind: 'strategy_change', goal: 'fix failing orchestration test' },
    {},
    db
  );
  assert(recall.episodes.length > 0, 'recall must surface relevant prior episodes');
  assert(recall.lessons.length > 0, 'recall must surface relevant lessons');
  assert(recall.summary.includes('Autobiographical recall'));
  assert(recall.adjustments.confidenceBoost > 0, 'a reuse lesson must boost confidence rather than restrict it');
}

async function run() {
  const dbPath = path.resolve(__dirname, 'test-autobiographical-memory.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    testSalience();
    await testCaptureAndForget(db);
    await testLessonConsolidationAndRecall(db);
    console.log('Autobiographical memory: salience, capture, forgetting, lesson consolidation and recall passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
