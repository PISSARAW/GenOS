'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = crypto.randomBytes(32).toString('hex');

const database = require('../src/db');
const barrier = require('../src/services/trinityComparativeBarrier');
const { previousPromotion } = require('../src/services/trinityPromotionIntegrity');

const claim = 'The candidate computes the expected answer from answer.txt.';

function comparison(agentId) {
  return { canMerge: true, selectedWorld: 1, selectedRole: 'basic_implementation', bestScore: 0.95,
    comparativeAnalysis: { scoredWorlds: [{ worldNumber: 1, agentId, score: 0.95,
      report: { claims: [{ statement: claim }] } }] } };
}

async function createWorld(db, root) {
  const source = path.join(root, 'world');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'answer.txt'), '42\n');
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ private: true,
    scripts: { test: 'node test.js' } }));
  await fs.writeFile(path.join(source, 'test.js'), `const fs = require('node:fs');
if (fs.readFileSync('answer.txt', 'utf8') !== '42\\n') process.exit(1);
`);
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'gqwf-qual-ws', 'GQWF qualification', source);
  await db.run(`INSERT INTO agents (id, name, role, status, workspace_id)
    VALUES (?, ?, 'worker', 'completed', ?)`, 'gqwf-qual-agent', 'GQWF worker', 'gqwf-qual-ws');
  await db.run(`INSERT INTO trinity_worlds
    (id, mission, world_number, name, strategy, status, agent_id, workspace_root)
    VALUES (?, ?, 1, 'World 1', 'basic_implementation', 'completed', ?, ?)`,
  'gqwf-qual-world', 'Qualify GQWF', 'gqwf-qual-agent', source);
  return source;
}

async function createExperiment(db, missionId) {
  const id = `gqwf-qual-${missionId}`;
  const design = { integrationChecks: ['npm-test'],
    claimVerificationChecks: [{ claim, commandIds: ['npm-test'] }] };
  await db.run(`INSERT INTO trinity_experiments
    (id, mission_id, domain, mission_snapshot_hash, design_json, status)
    VALUES (?, ?, 'software_engineering', ?, ?, 'sealed_running')`,
  id, missionId, crypto.createHash('sha256').update(missionId).digest('hex'), JSON.stringify(design));
  return id;
}

async function assertPublished(db, promotion, experimentId) {
  assert.equal(promotion.promoted, true, JSON.stringify(promotion));
  assert.equal(promotion.verification.integrationChecks.length, 1);
  assert.equal(promotion.verification.integrationChecks[0].passed, true);
  assert.equal(promotion.verification.claimChecks.length, 1);
  assert.equal(promotion.verification.claimChecks[0].receipt.independent, true);
  const row = await db.get('SELECT status, decision_json FROM trinity_experiments WHERE id = ?', experimentId);
  assert.equal(row.status, 'promoted');
  const decision = JSON.parse(row.decision_json);
  assert.equal(decision.gqwf.generation, 1);
  const head = await db.get('SELECT root_hash, generation FROM gqwf_heads WHERE workspace_id = ? AND name = ?',
    'gqwf-qual-ws', `trinity/${experimentId}`);
  assert.equal(head.root_hash, decision.gqwf.rootHash);
  assert.equal(head.generation, 1);
  const event = await db.get('SELECT evidence_id FROM gqwf_head_events WHERE workspace_id = ? AND name = ? AND generation = 1',
    'gqwf-qual-ws', `trinity/${experimentId}`);
  assert.equal(event.evidence_id, decision.agentGit.objectId);
  return decision;
}

async function qualify(root) {
  const dbPath = path.join(root, 'qualification.sqlite');
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  let db = await database.getDatabase(dbPath);
  const capsules = [];
  try {
    const source = await createWorld(db, root);
    const missionId = 'mission-success';
    const experimentId = await createExperiment(db, missionId);
    const result = comparison('gqwf-qual-agent');
    const promotion = await barrier.promoteWinner(db, { missionId, orchestratorId: 'gqwf-qual-agent',
      result, gqwfV2: true });
    if (promotion.artifact?.targetWorkspace) capsules.push(promotion.artifact.targetWorkspace);
    await assertPublished(db, promotion, experimentId);
    await database.closeDatabase();
    db = await database.getDatabase(dbPath);
    const replay = await previousPromotion({ db, missionId });
    assert.equal(replay.promoted, true);
    assert.equal(replay.idempotent, true);

    await fs.writeFile(path.join(source, 'answer.txt'), 'wrong\n');
    const failedMission = 'mission-failure';
    const failedExperiment = await createExperiment(db, failedMission);
    const failed = await barrier.promoteWinner(db, { missionId: failedMission,
      orchestratorId: 'gqwf-qual-agent', result: comparison('gqwf-qual-agent'), gqwfV2: true });
    if (failed.artifact?.targetWorkspace) capsules.push(failed.artifact.targetWorkspace);
    assert.equal(failed.promoted, false);
    assert.equal(failed.reason, 'TRINITY_INTEGRATION_CHECK_FAILED');
    assert.equal((await db.get('SELECT status FROM trinity_experiments WHERE id = ?', failedExperiment)).status,
      'promotion_failed');
    assert.equal(await db.get('SELECT root_hash FROM gqwf_heads WHERE workspace_id = ? AND name = ?',
      'gqwf-qual-ws', `trinity/${failedExperiment}`), undefined);

    await fs.writeFile(path.join(source, 'answer.txt'), '42\n');
    const rollbackMission = 'mission-rollback';
    const rollbackExperiment = await createExperiment(db, rollbackMission);
    await db.exec(`CREATE TRIGGER gqwf_qual_rollback BEFORE UPDATE ON workspaces
      WHEN NEW.description LIKE 'Verified Trinity candidate%'
      BEGIN SELECT RAISE(ABORT, 'forced promotion rollback'); END;`);
    const rolledBack = await barrier.promoteWinner(db, { missionId: rollbackMission,
      orchestratorId: 'gqwf-qual-agent', result: comparison('gqwf-qual-agent'), gqwfV2: true });
    if (rolledBack.artifact?.targetWorkspace) capsules.push(rolledBack.artifact.targetWorkspace);
    assert.equal(rolledBack.promoted, false);
    assert.equal((await db.get('SELECT status FROM trinity_experiments WHERE id = ?', rollbackExperiment)).status,
      'promotion_failed');
    assert.equal(await db.get('SELECT root_hash FROM gqwf_heads WHERE workspace_id = ? AND name = ?',
      'gqwf-qual-ws', `trinity/${rollbackExperiment}`), undefined);
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM gqwf_head_events WHERE workspace_id = ? AND name = ?',
      'gqwf-qual-ws', `trinity/${rollbackExperiment}`)).total, 0);
    await db.exec('DROP TRIGGER gqwf_qual_rollback');

    await db.run('UPDATE gqwf_head_events SET evidence_id = ? WHERE workspace_id = ? AND name = ?',
      'forged', 'gqwf-qual-ws', `trinity/${experimentId}`);
    assert.equal((await previousPromotion({ db, missionId })).reason, 'TRINITY_PROMOTION_GQWF_INVALID');
  } finally {
    await database.closeDatabase();
    for (const capsule of capsules) await require('../src/services/agentWorkspaceLifecycleService')
      .cleanupWorkspace(capsule);
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gqwf-trinity-qualification-'));
  try { await qualify(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
  console.log('GQWF Trinity physical mission promotion, independent proof, restart and refusal: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
