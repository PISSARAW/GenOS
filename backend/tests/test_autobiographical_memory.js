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
const orchestratorRecall = require('../src/services/autobiographicalMemory/orchestratorRecall');
const sensorium = require('../src/services/perception/sensoriumService');
const { runToolExecution } = require('../src/services/mcpExecutor/efferenceBridge');

function testSalience() {
  const failure = computeSalience({ eventType: 'AGENT_FAILED', payload: { status: 'failed', cost: { tokens: 6000 } } });
  assert(failure.salience >= DEFAULT_SALIENCE_THRESHOLD, 'a costly failure event must clear the salience threshold');
  const trivialStep = computeSalience({ eventType: 'AGENT_STEP', payload: {} });
  assert(trivialStep.salience < DEFAULT_SALIENCE_THRESHOLD, 'a plain step with no signal must not become a memory');
  const highRisk = computeSalience({ eventType: 'AGENT_STEP', payload: { risk: 0.9, cost: { tokens: 6000 } } });
  assert(highRisk.signals.highRisk === 1 && highRisk.signals.highCost === 1, 'risk/cost signals must be detected');
  assert.equal(resolveKind('AGENT_FAILED'), 'primitive_failure');
  assert.equal(resolveKind('PERCEPTION_OBSERVED'), 'perception');
  assert.equal(resolveKind('UNKNOWN_EVENT_TYPE'), null);
}

async function testPerceptionMemoryLoop(db) {
  const events = [];
  const execution = await runToolExecution({
    context: { agentId: 'perception-agent', toolName: 'genos_browser_act', actionId: 'action-1', args: { goal: 'inspect service dashboard', url: 'https://example.test/status' } },
    executeConfiguredTransport: async () => ({ success: true, status: 'completed', output: JSON.stringify({ title: 'Service status', observationText: 'service healthy 200', infoGain: 0.65, currentUrl: 'https://example.test/status' }) }),
    applyDomainVerdict: () => {},
    circuitBreaker: { recordSuccess: () => {}, recordFailure: () => {} },
    telemetry: { emitEvent: (event) => events.push(event) }
  });
  assert.equal(execution.success, true);
  const observationEvent = events.find((event) => event.eventType === 'PERCEPTION_OBSERVED');
  const observation = observationEvent.payload.observation;
  assert.equal(sensorium.getSensorium('perception-agent').observations[0].id, observation.id);
  const episode = await captureTelemetryEvent(observationEvent, db);
  assert.equal(episode.kind, 'perception');
  assert.equal(episode.outcome.status, 'observed');
  const recalled = await recallService.recallForSituation(
    { agentId: 'perception-agent', goal: 'inspect service dashboard' }, {}, db
  );
  assert.match(recalled.summary, /service healthy 200/);
  const mission = { prompt: 'Inspect service dashboard' };
  orchestratorRecall.attachRecallContext(mission, recalled);
  assert.match(mission.prompt, /GENOS AUTOBIOGRAPHICAL RECALL/);
  assert.match(mission.prompt, /service healthy 200/);
  assert.equal((await lessonService.consolidateLessons({ agentId: 'perception-agent' }, db))
    .some((lesson) => lesson.scope === 'perception'), false,
  'observations without an evaluated outcome must not become learned success or failure lessons');
  sensorium.clearSensorium('perception-agent');
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

async function testUnverifiedAndBlockedEvents(db) {
  const invalid = await captureTelemetryEvent({ id: 'unverified-report', eventType: 'EVIDENCE_REPORT',
    agentId: 'blocked_agent', timestamp: new Date().toISOString(),
    payload: { evidenceReport: { outcome: 'success', workerArtifact: { type: 'dossier' } } } }, db);
  assert.equal(invalid, null, 'a self-declared report must not count as validated evidence');
  const blockedEvent = (id) => ({ id, eventType: 'AGENT_FAILED', agentId: 'blocked_agent',
    timestamp: new Date().toISOString(), payload: { missionId: id,
      failure: { code: 'ORACLE_DOMAIN_UNAVAILABLE', reason: 'ORACLE_DOMAIN_UNAVAILABLE' } } });
  const first = await captureTelemetryEvent(blockedEvent('oracle-block-1'), db);
  const duplicate = await captureTelemetryEvent(blockedEvent('oracle-block-1'), db);
  assert.equal(first.id, duplicate.id, 'repeated telemetry must not produce duplicate episodes');
  assert.equal(first.outcome.status, 'blocked');
  await captureTelemetryEvent(blockedEvent('oracle-block-2'), db);
  await captureTelemetryEvent({ ...blockedEvent('oracle-budget-1'),
    payload: { failure: { code: 'ORACLE_BUDGET_EXPIRED' } } }, db);
  const lessons = await lessonService.consolidateLessons({ agentId: 'blocked_agent' }, db);
  assert.equal(lessons.length, 0, 'unsupported oracle domains must not teach a failed worker strategy');
  for (const [index, status] of ['success', 'failed'].entries()) {
    await episodeStore.recordEpisode({ agentId: 'contradictory_agent', missionId: `contrast-${index}`,
      kind: 'bounded_worker', salience: 0.7, situation: { goal: 'repeat task' },
      decision: { selectedStrategy: 'same_method' }, outcome: { status } }, db);
  }
  assert.equal((await lessonService.consolidateLessons({ agentId: 'contradictory_agent' }, db)).length,
    0, 'one success and one failure cannot establish a reusable lesson');
  for (const index of [1, 2]) await episodeStore.recordEpisode({
    agentId: 'tenant-agent', missionId: `tenant-${index}`, kind: 'strategy_change', salience: 0.8,
    organizationId: 'org-a', projectId: 'project-a', situation: { goal: 'tenant task' },
    decision: { selectedStrategy: 'verified_method' }, outcome: { status: 'success' }
  }, db);
  await lessonService.consolidateLessons({ agentId: 'tenant-agent' }, db);
  assert.equal((await lessonService.getLessons({ agentId: 'tenant-agent',
    organizationId: 'org-a', projectId: 'project-a' }, db)).length, 1);
  assert.equal((await lessonService.getLessons({ agentId: 'tenant-agent',
    organizationId: 'org-b', projectId: 'project-b' }, db)).length, 0);
  for (const index of [1, 2]) await episodeStore.recordEpisode({
    agentId: 'legacy-worker', missionId: `unverified-${index}`, kind: 'bounded_worker',
    salience: 0.8, situation: { goal: 'unverified task' },
    decision: { selectedStrategy: 'claimed_success' }, outcome: { status: 'success' }
  }, db);
  assert.equal((await lessonService.consolidateLessons({ agentId: 'legacy-worker' }, db)).length,
    0, 'old worker success labels without accepted mission provenance must stay audit-only');
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

  const stored = await lessonService.getLessons({ agentId: 'orchestrator_01', scope: 'strategy_change' }, db);
  assert(stored.some((l) => l.id === lesson.id), 'consolidated lesson must be persisted and retrievable');

  const recall = await recallService.recallForSituation(
    { agentId: 'orchestrator_01', kind: 'strategy_change', goal: 'fix failing orchestration test' },
    {},
    db
  );
  assert(recall.episodes.length > 0, 'recall must surface relevant prior episodes');
  assert(recall.lessons.length > 0, 'recall must surface relevant lessons');
  assert(recall.summary.includes('Autobiographical recall'));
  assert.equal(recall.adjustments.riskDelta, 0.05, 'validated repeated success raises bounded risk tolerance');
  const otherAgent = await lessonService.getLessons({ agentId: 'untrained-worker', scope: 'strategy_change' }, db);
  assert.equal(otherAgent.length, 0, 'another agent must not inherit an autobiographical lesson implicitly');
}

async function run() {
  const dbPath = path.resolve(__dirname, 'test-autobiographical-memory.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    testSalience();
    await testPerceptionMemoryLoop(db);
    await testCaptureAndForget(db);
    await testUnverifiedAndBlockedEvents(db);
    await testLessonConsolidationAndRecall(db);
    console.log('Autobiographical memory: salience, capture, forgetting, lesson consolidation and recall passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
