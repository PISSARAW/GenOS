'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const resolver = require('../../backend/src/services/morphogenesis/relationResolverService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const FIXTURE = [
  { id: 'friend', source_agent_id: 'agent-a', target_agent_id: 'agent-b', relation_type: 'friend', relation_class: 'social', metadata_json: '{"familiarity":0.9}' },
  { id: 'neighbor', source_agent_id: 'agent-a', target_agent_id: 'agent-c', relation_type: 'neighbor', relation_class: 'social', metadata_json: '{"familiarity":0.7}' },
  { id: 'manager', source_agent_id: 'agent-d', target_agent_id: 'agent-a', relation_type: 'manager', relation_class: 'organizational', metadata_json: '{"familiarity":0.5}' }
];

function canonical(items) { return items.map((item) => `${item.agentId}:${item.relationType}:${item.direction}`).sort(); }

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let result;
  try {
    const known = [];
    for (const agentId of ['agent-b', 'agent-c', 'agent-d']) {
      const profiles = await resolver.getRelationProfiles('agent-a', agentId, {
        db: { all: async () => FIXTURE }, organizationId: 'socialworld-org', projectId: 'socialworld-project'
      });
      known.push(...profiles.map((profile) => ({ agentId, relationType: profile.relationType, direction: profile.direction })));
    }
    const expected = canonical(known);
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Identify every known relation of agent-a from this GenOS graph. Copy exact agent IDs, relation types, and directions. Do not invent unknown relations.',
        `Graph-derived profile: ${JSON.stringify(known)}`,
        'Return one JSON object with a relations array of {agentId, relationType, direction}.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 100, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const match = String(response.text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Qwen did not return a JSON object.');
    const answer = JSON.parse(match[0]).relations;
    const passed = JSON.stringify(canonical(answer)) === JSON.stringify(expected);
    result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S01', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: known, answer,
      qwenResponse: response.text, verified: passed,
      oracle: 'all graph relations of the subject are reproduced with exact agent identity and direction, without additions',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
  } catch (error) {
    result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S01', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      verified: false, durationMs: Date.now() - startedAt };
  }
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S01-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.verified) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
