'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const kinship = require('../../backend/src/services/socialKinshipService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { agentId: 'agent-a', parents: ['agent-p'],
  ancestors: [{ agentId: 'agent-p', generations: 1 }, { agentId: 'agent-g', generations: 2 }],
  siblings: ['agent-s'], twins: ['agent-t'], children: ['agent-c'] };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { agentId: value.agentId, parents: value.parents, ancestors: value.ancestors,
    siblings: value.siblings, twins: value.twins, children: value.children };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S04-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createFamily(db) {
  for (const id of ['agent-g', 'agent-p', 'agent-a', 'agent-s', 'agent-t', 'agent-c']) {
    await db.run('INSERT INTO agents (id, name, role, status) VALUES (?, ?, ?, ?)', [id, id, 'worker', 'idle']);
  }
  const edges = [
    ['s04-grandparent', 'agent-g', 'agent-p', 'parent'],
    ['s04-parent', 'agent-p', 'agent-a', 'parent'],
    ['s04-sibling', 'agent-s', 'agent-a', 'sibling'],
    ['s04-twin', 'agent-t', 'agent-a', 'twin'],
    ['s04-child', 'agent-a', 'agent-c', 'parent']
  ];
  for (const [id, sourceAgentId, targetAgentId, relationType] of edges) {
    await relations.createRelation({ db, id, sourceAgentId, targetAgentId, relationType,
      relationClass: 'lineage', organizationId: 'socialworld-org', projectId: 'socialworld-project' });
  }
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let observed = null; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createFamily(db);
    observed = await kinship.getKinshipProfile({ db, agentId: 'agent-a',
      organizationId: 'socialworld-org', projectId: 'socialworld-project' });
    const enginePass = JSON.stringify(observed) === JSON.stringify(EXPECTED);
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Read this scoped, directed GenOS family profile. Copy parent, ancestor generation, sibling, twin and child IDs exactly. Do not reverse links or add relatives.',
        `Profile: ${JSON.stringify(observed)}`,
        'Return ONLY JSON with agentId, parents, ancestors (agentId and generations), siblings, twins, and children.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 100, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S04', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      observed, answer, qwenResponse, enginePass, verified: passed,
      oracle: 'directed lineage yields correct parent/child/sibling/twin identities and a two-generation ancestor without cross-scope edges',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S04', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      observed, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
