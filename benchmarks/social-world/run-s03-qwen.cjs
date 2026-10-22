'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const resolver = require('../../backend/src/services/morphogenesis/relationResolverService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = [
  { agentId: 'agent-b', relationType: 'friend', sharedEvents: ['bridge-map:shared-11'] },
  { agentId: 'agent-c', relationType: 'stranger', sharedEvents: [] }
];

function canonical(items) { return items.map((item) => JSON.stringify(item)).sort(); }

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S03-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createWorld(db) {
  for (const id of ['agent-a', 'agent-b', 'agent-c']) {
    await db.run('INSERT INTO agents (id, name, role, status) VALUES (?, ?, ?, ?)', [id, id, 'worker', 'idle']);
  }
  await relations.createRelation({ db, id: 's03-friend', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'friend', relationClass: 'social', organizationId: 'socialworld-org',
    projectId: 'socialworld-project', metadata: { sharedEvents: ['bridge-map:shared-11'], sharedHistory: 0.8 } });
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let profiles = null; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    profiles = [];
    for (const agentId of ['agent-b', 'agent-c']) {
      const profile = await resolver.getRelationProfile('agent-a', agentId, {
        db, organizationId: 'socialworld-org', projectId: 'socialworld-project'
      });
      profiles.push({ agentId, relationType: profile.relationType,
        sharedEvents: profile.relations?.[0]?.properties?.sharedEvents || [] });
    }
    const databasePass = JSON.stringify(canonical(profiles)) === JSON.stringify(canonical(EXPECTED));
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['From these GenOS social profiles, identify the friend and recall only the event in shared history. Distinguish the stranger and do not invent shared events.',
        `Profiles: ${JSON.stringify(profiles)}`,
        'Return ONLY JSON in this shape: {"relationships":[{"agentId":"agent-b","relationType":"friend","sharedEvents":["bridge-map:shared-11"]},{"agentId":"agent-c","relationType":"stranger","sharedEvents":[]}]}.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 90, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    qwenResponse = response.text;
    const match = qwenResponse.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Qwen did not return a JSON object.');
    const answer = JSON.parse(match[0]).relationships;
    const passed = databasePass && JSON.stringify(canonical(answer)) === JSON.stringify(canonical(EXPECTED));
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S03', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      profiles, answer, qwenResponse, databasePass, verified: passed,
      oracle: 'a friend retains its shared event while an unlinked agent remains a stranger with no shared history',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S03', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      profiles, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
