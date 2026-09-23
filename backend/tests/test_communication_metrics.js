'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

process.env.NODE_ENV = 'test';
process.env.GENOS_SCHEMA_MAINTENANCE = '0';

const { initializeSchema } = require('../src/db/schema');
const metrics = require('../src/services/communication/communicationMetricsService');

const DB_PATH = path.join(os.tmpdir(), `genos-comm-metrics-${process.pid}-${Date.now()}.db`);

async function setup() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  await initializeSchema(db);
  return db;
}

async function seedOutcomes(db) {
  const rows = [
    ['agent-a', 'agent-b', 'planning', 'structured', 'action_taken', 100],
    ['agent-a', 'agent-c', 'planning', 'structured', 'action_taken', 120],
    ['agent-b', 'agent-a', 'planning', 'SIGNAL', 'no_effect', 80],
    ['agent-c', 'agent-a', 'planning', 'DIALOGUE', 'ignored', 200],
    ['agent-a', 'agent-b', 'execution', 'MICRO_UTTERANCE', 'action_taken', 150],
    ['agent-b', 'agent-c', 'execution', 'structured', 'ignored', 90],
    ['agent-c', 'agent-b', 'monitoring', 'HUMAN', 'action_taken', 300],
  ];
  for (const r of rows) {
    await db.run(
      `INSERT INTO communication_outcomes
        (sender_id, receiver_id, domain, refs_json, channel, outcome, action_taken, recipient_knew, tokens_used)
       VALUES (?, ?, ?, '[]', ?, ?, ?, 0, ?)`,
      [r[0], r[1], r[2], r[3], r[4], r[4] === 'action_taken' ? 1 : 0, r[5]]
    );
  }
}

async function testByDomain(db) {
  metrics.resetMetrics();
  const result = await metrics.getExtendedMetrics({ db });

  assert.equal(result.byDomain.planning.total, 4, 'planning total');
  assert.equal(result.byDomain.planning.acted, 2, 'planning acted');
  assert.equal(result.byDomain.planning.wasted, 2, 'planning wasted');
  assert.equal(result.byDomain.planning.tokens, 500, 'planning tokens');
  assert.strictEqual(result.byDomain.planning.actionRate, 0.5, 'planning actionRate');
  assert.strictEqual(result.byDomain.planning.wasteRate, 0.5, 'planning wasteRate');

  assert.equal(result.byDomain.execution.total, 2, 'execution total');
  assert.equal(result.byDomain.execution.acted, 1, 'execution acted');
  assert.equal(result.byDomain.execution.wasted, 1, 'execution wasted');

  assert.equal(result.byDomain.monitoring.total, 1, 'monitoring total');
  assert.equal(result.byDomain.monitoring.acted, 1, 'monitoring acted');
  assert.equal(result.byDomain.monitoring.wasted, 0, 'monitoring wasted');
  assert.strictEqual(result.byDomain.monitoring.actionRate, 1, 'monitoring actionRate');
  assert.strictEqual(result.byDomain.monitoring.wasteRate, 0, 'monitoring wasteRate');
}

async function testByChannel(db) {
  const result = await metrics.getExtendedMetrics({ db });

  assert.equal(result.byChannel.structured.total, 3, 'structured total');
  assert.equal(result.byChannel.structured.acted, 2, 'structured acted');
  assert.equal(result.byChannel.structured.wasted, 1, 'structured wasted');

  assert.equal(result.byChannel.SIGNAL.total, 1, 'SIGNAL total');
  assert.equal(result.byChannel.SIGNAL.acted, 0, 'SIGNAL acted');
  assert.equal(result.byChannel.SIGNAL.wasted, 1, 'SIGNAL wasted');

  assert.equal(result.byChannel.DIALOGUE.total, 1, 'DIALOGUE total');
  assert.equal(result.byChannel.DIALOGUE.wasted, 1, 'DIALOGUE wasted');

  assert.equal(result.byChannel.MICRO_UTTERANCE.total, 1, 'MICRO_UTTERANCE total');
  assert.equal(result.byChannel.MICRO_UTTERANCE.acted, 1, 'MICRO_UTTERANCE acted');
  assert.strictEqual(result.byChannel.MICRO_UTTERANCE.actionRate, 1, 'MICRO_UTTERANCE actionRate');

  assert.equal(result.byChannel.HUMAN.total, 1, 'HUMAN total');
  assert.equal(result.byChannel.HUMAN.acted, 1, 'HUMAN acted');
}

async function testByAgent(db) {
  const result = await metrics.getExtendedMetrics({ db });

  assert.equal(result.byAgent['agent-a'].total, 3, 'agent-a total');
  assert.equal(result.byAgent['agent-a'].acted, 3, 'agent-a acted');
  assert.equal(result.byAgent['agent-a'].tokens, 370, 'agent-a tokens');
  assert.strictEqual(result.byAgent['agent-a'].actionRate, 1, 'agent-a actionRate');

  assert.equal(result.byAgent['agent-b'].total, 2, 'agent-b total');
  assert.equal(result.byAgent['agent-b'].acted, 0, 'agent-b acted');
  assert.equal(result.byAgent['agent-b'].tokens, 170, 'agent-b tokens');

  assert.equal(result.byAgent['agent-c'].total, 2, 'agent-c total');
  assert.equal(result.byAgent['agent-c'].acted, 1, 'agent-c acted');
  assert.equal(result.byAgent['agent-c'].tokens, 500, 'agent-c tokens');
}

async function testOutcomes(db) {
  const result = await metrics.getExtendedMetrics({ db });

  assert.equal(result.outcomes.total, 7, 'total outcomes');
  assert.equal(result.outcomes.byOutcome.action_taken, 4, 'action_taken count');
  assert.equal(result.outcomes.byOutcome.no_effect, 1, 'no_effect count');
  assert.equal(result.outcomes.byOutcome.ignored, 2, 'ignored count');
  assert.ok(Math.abs(result.outcomes.actionRate - 4 / 7) < 1e-9, 'actionRate = 4/7');
  assert.ok(Math.abs(result.outcomes.wasteRate - 3 / 7) < 1e-9, 'wasteRate = 3/7');
}

async function testCountersPresent(db) {
  const result = await metrics.getExtendedMetrics({ db });

  assert.ok(result.counters, 'counters object present');
  assert.ok('attempts' in result.counters, 'attempts counter present');
  assert.ok('tokensInput' in result.counters, 'tokensInput counter present');
  assert.ok('usefulActions' in result.counters, 'usefulActions counter present');
  assert.ok(result.computedAt, 'computedAt timestamp present');
}

async function run() {
  const db = await setup();
  try {
    await seedOutcomes(db);

    await testByDomain(db);
    console.log('[PASS] byDomain breakdown correct');

    await testByChannel(db);
    console.log('[PASS] byChannel breakdown correct');

    await testByAgent(db);
    console.log('[PASS] byAgent breakdown correct');

    await testOutcomes(db);
    console.log('[PASS] outcome rates correct');

    await testCountersPresent(db);
    console.log('[PASS] counters present');

    console.log('\nAll communication metrics tests passed.');
  } finally {
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + suffix); } catch (_) {}
    }
  }
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
