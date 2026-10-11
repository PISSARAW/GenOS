'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { inspect, signedCandidateObject } = require('../bin/trinity-nominal-campaign.cjs');
const variants = require('../src/services/trinityVariantService');
const agentGit = require('../src/services/agentGitService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('CREATE TABLE trinity_experiments (id TEXT, mission_id TEXT, status TEXT, decision_json TEXT)');
    await db.exec('CREATE TABLE trinity_dispatch_configs (mission_id TEXT, variant_selection_json TEXT)');
    await db.exec('CREATE TABLE trinity_worlds (experiment_id TEXT, world_number INTEGER, agent_id TEXT, status TEXT)');
    await db.run('INSERT INTO trinity_experiments VALUES (?, ?, ?, ?)',
      'experiment-x', 'mission-x', 'escalated', JSON.stringify({ outcome: 'ESCALATE_EXPERIMENT' }));
    await db.run('INSERT INTO trinity_dispatch_configs VALUES (?, ?)',
      'mission-x', JSON.stringify({ variant: 'controlled', experimentalDesign: variants.DEFAULT_DESIGN }));
    for (let number = 1; number <= 3; number += 1) {
      await db.run('INSERT INTO trinity_worlds VALUES (?, ?, ?, ?)',
        'experiment-x', number, `world-${number}`, 'compared');
    }
    const result = await inspect(db, 'controlled', 'mission-x');
    assert.equal(result.qualified, false);
    assert.ok(result.reasons.includes('promotion_not_observed'));
    assert.ok(!result.reasons.includes('initial_worlds_incomplete'));
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

run().then(() => console.log('Trinity nominal SQLite campaign: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
