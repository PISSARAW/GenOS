'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD ||= 'autobiographical-recall-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const episodes = require('../src/services/autobiographicalMemory/episodeStore');
const lessons = require('../src/services/autobiographicalMemory/lessonService');
const { recallBeforePlanning } = require('../src/services/autobiographicalMemory/orchestratorRecall');

async function seed(db) {
  for (const index of [1, 2]) await episodes.recordEpisode({
    agentId: 'orch-1', missionId: `recall-${index}`, kind: 'strategy_change', salience: 0.8,
    situation: { goal: 'repair orchestration' }, decision: { selectedStrategy: 'unsafe-retry' },
    outcome: { status: 'failed' }
  }, db);
  const produced = await lessons.consolidateLessons({ agentId: 'orch-1' }, db);
  assert.equal(produced.length, 1);
}

async function probe(db, agentId) {
  const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.35, evidenceStrictness: 0.82 },
    limits: {}, state: { confidence: 0.5 } } };
  const result = await recallBeforePlanning({ db, agentId,
    normalizedMission: { prompt: 'repair orchestration', kind: 'strategy_change' }, autonomyPlan: plan });
  return { result, plan };
}

async function run() {
  const dbPath = path.join(__dirname, 'test-autobiographical-orchestrator-recall.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await seed(db);
    const trained = await probe(db, 'orch-1');
    assert.equal(trained.result.episodes.length, 2);
    assert.equal(trained.result.lessons.length, 1);
    assert(Math.abs(trained.plan.selfModel.decisionPolicy.riskTolerance - 0.25) < 1e-9);
    assert(Math.abs(trained.plan.selfModel.decisionPolicy.evidenceStrictness - 0.92) < 1e-9);
    assert(Math.abs(trained.plan.selfModel.limits.riskTolerance - 0.25) < 1e-9);
    const control = await probe(db, 'orch-untrained');
    assert.equal(control.result.lessons.length, 0);
    assert.equal(control.plan.selfModel.decisionPolicy.riskTolerance, 0.35);
    console.log('Autobiographical recall changes only the trained agent policy.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
