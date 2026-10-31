'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const authorityBridge = require('../../backend/src/services/relationAuthorityBridge');
const agentAuthority = require('../../backend/src/services/agentAuthorityService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { relationType: 'manager', direction: 'forward', relationGrantsControl: false, actualControlAllowed: false };

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S06-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

function testBridge() {
  const execution = spawnSync(process.execPath, ['backend/tests/test_relation_authority_bridge.js'],
    { encoding: 'utf8', env: process.env });
  return { exitCode: execution.status, output: String(execution.stdout || execution.stderr || '').trim() };
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  for (const [id, role] of [['agent-a', 'worker'], ['agent-b', 'worker']]) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, role, 'idle', 'worker', 'socialworld-space']);
  }
  await relations.createRelation({ db, id: 's06-colleague', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'colleague', relationClass: 'organizational', organizationId: 'socialworld-org', projectId: 'socialworld-project' });
  await db.run("UPDATE agent_relations SET relation_type = 'manager', updated_at = CURRENT_TIMESTAMP WHERE id = 's06-colleague'");
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let profile = null; let controlError = null; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    const control = await authorityBridge.resolveControlByRelation('agent-a', 'agent-b', {
      db, organizationId: 'socialworld-org', projectId: 'socialworld-project'
    });
    profile = control.profile;
    try { await agentAuthority.authorizeAgentControl(db, { actorId: 'agent-a', targetId: 'agent-b' }); }
    catch (error) { controlError = { code: error.code, message: error.message }; }
    const actualControlAllowed = controlError === null;
    const observed = { relationType: profile.relationType, direction: profile.direction,
      relationGrantsControl: control.granted, actualControlAllowed };
    const bridgeTest = testBridge();
    const enginePass = require('./run-s06-qwenValues1.cjs').mainValue1({ EXPECTED, JSON, bridgeTest, get controlError() { return controlError; }, observed });
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['A coworker relationship changed to manager in the social graph. Copy the current relationship and actual GenOS authority outcome. A social rank must not grant runtime control by itself.',
        `Observed authority profile: ${JSON.stringify(observed)}`,
        'Return ONLY JSON with relationType, direction, relationGrantsControl, and actualControlAllowed.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 60, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    qwenResponse = response.text;
    const match = qwenResponse.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Qwen did not return a JSON object.');
    const value = JSON.parse(match[0]);
    const answer = { relationType: value.relationType, direction: value.direction,
      relationGrantsControl: value.relationGrantsControl, actualControlAllowed: value.actualControlAllowed };
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S06', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED, observed,
      controlError, bridgeTest, qwenResponse, answer, enginePass, verified: passed,
      oracle: 'hierarchical relationship is recognized but only explicit runtime delegation grants actual control',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S06', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      profile, controlError, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
