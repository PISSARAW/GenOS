'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const resolver = require('../../backend/src/services/morphogenesis/relationResolverService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = [
  { relationType: 'friend', direction: 'forward' },
  { relationType: 'colleague', direction: 'forward' },
  { relationType: 'manager', direction: 'reverse' }
];
const FIXTURE = [
  { id: 'friend', source_agent_id: 'a', target_agent_id: 'b', relation_type: 'friend', relation_class: 'social', metadata_json: '{"familiarity":0.95}' },
  { id: 'colleague', source_agent_id: 'a', target_agent_id: 'b', relation_type: 'colleague', relation_class: 'organizational', metadata_json: '{"familiarity":0.7}' },
  { id: 'manager', source_agent_id: 'b', target_agent_id: 'a', relation_type: 'manager', relation_class: 'organizational', metadata_json: '{"familiarity":0.5}' }
];

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  if (!Array.isArray(value.relations)) throw new Error('Qwen response has no relations array.');
  return value.relations.map((item) => ({ relationType: item.relationType, direction: item.direction }));
}

function canonical(entries) {
  return entries.map((entry) => `${entry.relationType}:${entry.direction}`).sort();
}

function promptFor(profile) {
  return [
    'You are an agent in the GenOS SocialWorld scenario S07.',
    'Read the relationship profile produced by GenOS and report every distinct relationship and its direction from agent A perspective.',
    'Do not infer relationships that are absent from the profile. Return JSON with one property relations, an array of objects with relationType and direction.',
    `Profile: ${JSON.stringify({ relationTypes: profile.relationTypes, relations: profile.relations })}`
  ].join('\n\n');
}

function fixtureDb() {
  return { all: async () => FIXTURE };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = result.status === 'pass' ? 'S07-success.json' : `S07-attempt-${String(result.attempt).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(dir, fileName), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const attemptArg = process.argv.find((arg) => arg.startsWith('--attempt='));
  const attempt = attemptArg ? Number(attemptArg.split('=')[1]) : 1;
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('Attempt must be a positive integer.');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const profile = await resolver.getRelationProfile('a', 'b', {
    db: fixtureDb(), organizationId: 'socialworld', projectId: 's07'
  });
  const prompt = promptFor(profile);
  const startedAt = Date.now();
  try {
    const response = await modelProvider.generate({ model: MODEL, prompt, seed, temperature: 0,
      responseFormat: 'json_object', enforceSchema: false, stream: false, maxTokens: 250,
      timeoutMs: 90000, organizationId: 'socialworld', projectId: 's07', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = JSON.stringify(canonical(answer)) === JSON.stringify(canonical(EXPECTED));
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S07', seed, attempt,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      genosProfile: profile, qwenResponse: response.text, answer,
      verified: passed, oracle: 'exact relation type and direction set from the seeded graph',
      durationMs: Date.now() - startedAt, testCommand: ['node benchmarks/social-world/run-s07-qwen.cjs', '--seed=' + seed, '--attempt=' + attempt].join(' ') };
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S07', seed, attempt,
      status: 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      genosProfile: profile, error: error.message, verified: false,
      durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
