'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { inspect, signedCandidateObject } = require('../bin/trinity-nominal-campaign.cjs');
const variants = require('../src/services/trinityVariantService');
const agentGit = require('../src/services/agentGitService');
const comparisonJournal = require('../src/services/trinityNominalComparisonJournal');
const journal = require('../src/services/trinityExecutionJournal');

async function run() {
  await realComparisonRoundTrip();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('CREATE TABLE trinity_experiments (id TEXT, mission_id TEXT, mission_snapshot_hash TEXT, status TEXT, decision_json TEXT)');
    await db.exec('CREATE TABLE trinity_dispatch_configs (mission_id TEXT, variant_selection_json TEXT)');
    await db.exec('CREATE TABLE trinity_worlds (experiment_id TEXT, world_number INTEGER, agent_id TEXT, status TEXT, snapshot_hash TEXT, workspace_root TEXT)');
    await db.exec('CREATE TABLE trinity_experiment_transitions (id INTEGER PRIMARY KEY, experiment_id TEXT, from_status TEXT, to_status TEXT, actor TEXT, evidence_ref TEXT)');
    const baseline = 'a'.repeat(64);
    await db.run('INSERT INTO trinity_experiments VALUES (?, ?, ?, ?, ?)',
      'experiment-x', 'mission-x', baseline, 'escalated',
      JSON.stringify({ outcome: 'ESCALATE_EXPERIMENT', worldNumber: 1, variantGates: {} }));
    await db.run('INSERT INTO trinity_dispatch_configs VALUES (?, ?)',
      'mission-x', JSON.stringify({ variant: 'controlled', experimentalDesign: variants.DEFAULT_DESIGN }));
    for (let number = 1; number <= 3; number += 1) {
      await db.run('INSERT INTO trinity_worlds VALUES (?, ?, ?, ?, ?, ?)',
        'experiment-x', number, `world-${number}`, 'compared', baseline,
        require('node:path').resolve(`world-${number}`));
    }
    const result = await inspect(db, 'controlled', 'mission-x');
    assert.equal(result.qualified, false);
    assert.ok(result.reasons.includes('promotion_not_observed'));
    assert.ok(!result.reasons.includes('initial_worlds_incomplete'));
    assert.ok(!result.reasons.includes('sealed_baseline_mismatch'));
    assert.ok(!result.reasons.includes('isolated_worlds_not_observed'));
    assert.ok(result.reasons.includes('promotion_trace_incomplete'));
    assert.ok(result.reasons.includes('comparison_journal_not_verified'));
    await db.exec('CREATE TABLE trinity_runtime_journal (mission_id TEXT, stage TEXT, input_hash TEXT, value_json TEXT)');
    await db.exec('CREATE TABLE trinity_trace_events (mission_id TEXT, event_id TEXT, stage_id TEXT, stage TEXT, status TEXT, event_hash TEXT, event_json TEXT)');
    const value = { outcome: 'PROMOTE_WORLD', selectedWorld: 1,
      comparativeAnalysis: { adaptiveBudgetExecution: { status: 'executed' } } };
    const inputHash = journal.digest({ missionId: 'mission-x' });
    const stageMetadata = { stage: 'comparison', stageId: 'comparison:fixture', correlation: { missionId: 'mission-x' } };
    const eventBody = { eventId: 'comparison-event', stageId: stageMetadata.stageId,
      stage: 'comparison', status: 'completed', correlation: stageMetadata.correlation,
      details: { inputHash, resultDigest: journal.digest(value) } };
    const event = { ...eventBody, hash: journal.digest(eventBody) };
    const record = { value, digest: journal.digest(value), trace: stageMetadata, traceDigest: journal.digest(stageMetadata) };
    await db.run('INSERT INTO trinity_runtime_journal VALUES (?, ?, ?, ?)',
      'mission-x', 'comparison', inputHash, JSON.stringify(record));
    await db.run('INSERT INTO trinity_trace_events VALUES (?, ?, ?, ?, ?, ?, ?)',
      'mission-x', event.eventId, stageMetadata.stageId, 'comparison', 'completed', event.hash, JSON.stringify(eventBody));
    assert.equal((await comparisonJournal.read(db, 'mission-x')).status, 'verified');
    const linked = await inspect(db, 'controlled', 'mission-x');
    assert.ok(!linked.reasons.includes('comparison_journal_not_verified'));
    assert.ok(linked.reasons.includes('variant_gates_not_durable'));
    await db.run('DELETE FROM trinity_trace_events WHERE event_id = ?', event.eventId);
    assert.equal((await comparisonJournal.read(db, 'mission-x')).status, 'invalid');
    await db.run('INSERT INTO trinity_trace_events VALUES (?, ?, ?, ?, ?, ?, ?)',
      'mission-x', event.eventId, stageMetadata.stageId, 'comparison', 'completed', event.hash, JSON.stringify(eventBody));
    await db.run('UPDATE trinity_runtime_journal SET value_json = ? WHERE mission_id = ?',
      JSON.stringify({ ...record, digest: 'bad' }), 'mission-x');
    assert.equal((await comparisonJournal.read(db, 'mission-x')).status, 'invalid');
    const metadata = { experimentId: 'experiment-x', worldNumber: 1,
      contentHash: 'sha256:content', candidateWorkspaceId: 'candidate-x' };
    const object = { commit_hash: 'commit-x', metadata_json: JSON.stringify(metadata),
      signature: agentGit.signObject('commit-x', metadata), signature_algorithm: 'hmac-sha256' };
    const decision = { worldNumber: 1, verification: { contentHash: 'sha256:content' },
      artifact: { candidateWorkspaceId: 'candidate-x' }, agentGit: { commitHash: 'commit-x' } };
    assert.equal(signedCandidateObject({ object, experiment: { id: 'experiment-x' }, decision }), true);
    assert.equal(signedCandidateObject({ object, experiment: { id: 'other-experiment' }, decision }), false);
  } finally {
    await db.close();
  }
}

async function realComparisonRoundTrip() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await journal.phase({ db, missionId: 'real-comparison', configuration: { variant: 'adaptive' } },
      'comparison', async () => ({ outcome: 'PROMOTE_WORLD', selectedWorld: 1, comparativeAnalysis: {
        adaptiveBudgetExecution: { status: 'executed' } } }));
    const observed = await comparisonJournal.read(db, 'real-comparison');
    assert.equal(observed.status, 'verified');
    assert.equal(observed.comparison.comparativeAnalysis.adaptiveBudgetExecution.status, 'executed');
  } finally {
    await db.close();
  }
}

run().then(() => console.log('Trinity nominal SQLite campaign: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
