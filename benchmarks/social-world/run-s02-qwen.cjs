'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const socialNeighbors = require('../../backend/src/services/socialNeighborService');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const SCOPE = { organizationId: 'socialworld-org', projectId: 'socialworld-project', radius: 2 };

function canonical(entries) {
  return entries.map((entry) => `${entry.sourceAgentId}:${entry.targetAgentId}:${entry.distance}`).sort();
}

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  if (!Array.isArray(value.neighbors)) throw new Error('Qwen response has no neighbors array.');
  return value.neighbors;
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S02-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  for (const [id, x] of [['agent-a', 0], ['agent-b', 1], ['agent-c', 10], ['agent-d', 11]]) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'idle', 'worker', 'socialworld-space', JSON.stringify({ socialPosition: { x, y: 0 }, zoneLabel: 'initial' })]);
  }
  await relations.createRelation({ db, id: 's02-friendship', sourceAgentId: 'agent-a', targetAgentId: 'agent-d',
    relationType: 'friend', relationClass: 'social', ...SCOPE });
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let before = null; let after = null;
  let observed = null; let enginePass = false; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    before = await socialNeighbors.recalculateNeighbors({ ...SCOPE, db });
    after = await socialNeighbors.moveAgent({ ...SCOPE, db, agentId: 'agent-b', x: 10.5, y: 0 });
    const friend = await relations.getRelation({ db, id: 's02-friendship' });
    const expected = [
      { sourceAgentId: 'agent-b', targetAgentId: 'agent-c', distance: 0.5 },
      { sourceAgentId: 'agent-b', targetAgentId: 'agent-d', distance: 0.5 },
      { sourceAgentId: 'agent-c', targetAgentId: 'agent-d', distance: 1 }
    ];
    const edgeRows = await db.all("SELECT source_agent_id AS sourceAgentId, target_agent_id AS targetAgentId, json_extract(metadata_json, '$.distance') AS distance FROM agent_relations WHERE relation_type = 'neighbor' ORDER BY source_agent_id, target_agent_id");
    observed = edgeRows.map((edge) => ({ ...edge, distance: Number(edge.distance) }));
    enginePass = JSON.stringify(canonical(observed)) === JSON.stringify(canonical(expected))
      && !observed.some((edge) => edge.sourceAgentId === 'agent-a' || edge.targetAgentId === 'agent-a')
      && friend.relationType === 'friend'
      && after.changes.removed === 1;
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['A resident moved. Copy the exact neighbor pairs and distances recalculated by GenOS from positions; do not use the former zone labels.',
        `Before move: ${JSON.stringify(before.neighbors)}`,
        `After move: ${JSON.stringify(observed)}`,
        'Return ONLY valid JSON in this exact shape: {"neighbors":[{"sourceAgentId":"agent-b","targetAgentId":"agent-c","distance":0.5}]}. Distances must be JSON numbers, with no units or commentary. Include every after-move neighbor exactly once.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 100, timeoutMs: 180000,
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(canonical(answer)) === JSON.stringify(canonical(expected));
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S02', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, observed,
      before: before.neighbors, changes: after.changes, preservedFriend: friend,
      qwenResponse, answer, enginePass, verified: passed,
      oracle: 'moving B removes former A-B neighborhood and recalculates B-C, B-D, C-D by measured Euclidean distance while retaining independent friendship',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S02', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      before, after, observed, enginePass, qwenResponse, verified: false,
      stage: qwenResponse ? 'qwen-verification' : 'genos-neighbor-recalculation',
      durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
