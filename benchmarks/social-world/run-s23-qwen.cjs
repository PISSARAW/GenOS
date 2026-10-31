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
const EXPECTED = [{ relationType: 'friend', direction: 'forward', sharedHistory: 0.65 }];

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  if (!Array.isArray(value.relations)) throw new Error('Qwen response has no relations array.');
  return value.relations.map((item) => ({ relationType: item.relationType,
    direction: item.direction, sharedHistory: Number(item.sharedHistory) }));
}

function promptFor(profile) {
  const entries = profile.relations.map(({ relationType, direction, properties }) => ({
    relationType, direction, sharedHistory: properties.sharedHistory
  }));
  return ['An agent resumed after moving from mission-1 to mission-2. Copy every persisted relation, direction and sharedHistory value from GenOS. Do not add facts.',
    `Persisted profile: ${JSON.stringify(entries)}`,
    'Return JSON with a relations array. Each item must contain relationType, direction and sharedHistory.'].join('\n\n');
}

function saveResult(result, filename = 'S23-result.json') {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), `${JSON.stringify(result, null, 2)}\n`);
}

async function warmModel(seed) {
  const startedAt = Date.now();
  const response = await modelProvider.generate({ model: MODEL,
    prompt: 'Return exactly this JSON object: {"ready":true}', seed, temperature: 0,
    enforceSchema: false, stream: false, maxTokens: 20, timeoutMs: 180000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  const match = String(response.text || '').match(/\{[\s\S]*\}/);
  if (!match || JSON.parse(match[0]).ready !== true) throw new Error('Qwen warmup response was invalid.');
  return { model: MODEL, durationMs: Date.now() - startedAt, response: response.text };
}

async function buildMissionProfiles() {
  const db = await getDatabase(':memory:');
  try {
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('agent-a', 'A', 'worker', 'idle')");
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('agent-b', 'B', 'worker', 'idle')");
    await relations.createRelation({ db, id: 's23-friendship', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
      relationType: 'friend', relationClass: 'social', organizationId: 'socialworld-org',
      projectId: 'socialworld-project', metadata: { familiarity: 0.82, sharedHistory: 0.65,
        interactionCount: 8, lastInteraction: 'mission-1:shared-evidence-42' } });
    const previousMission = await resolver.getRelationProfile('agent-a', 'agent-b', {
      db, organizationId: 'socialworld-org', projectId: 'socialworld-project', missionId: 'mission-1' });
    const resumedMission = await resolver.getRelationProfile('agent-a', 'agent-b', {
      db, organizationId: 'socialworld-org', projectId: 'socialworld-project', missionId: 'mission-2' });
    return { previousMission, resumedMission };
  } finally {
    await closeDatabase();
  }
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  const deterministicOnly = process.argv.includes('--deterministic-only');
  let warmup = null;
  let previousMission = null;
  let resumedMission = null;
  let deterministicPass = false;
  try {
    ({ previousMission, resumedMission } = await buildMissionProfiles());
    deterministicPass = require('./run-s23-qwenValues1.cjs').mainValue1({ get previousMission() { return previousMission; }, get resumedMission() { return resumedMission; } });
    if (!deterministicPass) throw new Error('Social relation or its evidence did not survive the mission transition.');
    if (deterministicOnly) {
      const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S23', seed,
        status: 'pass', model: null, sourceCommit, expected: EXPECTED,
        missionTransitions: ['mission-1', 'mission-2'], humanInstructionsAfterSetup: 0,
        previousMission, resumedMission, deterministicPass, verified: true,
        oracle: 'GenOS persists the relation and its evidence across mission contexts',
        durationMs: Date.now() - startedAt };
      saveResult(result, 'S23-genos-result.json');
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    warmup = await warmModel(seed);
    const response = await modelProvider.generate({ model: MODEL, prompt: promptFor(resumedMission),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 90000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S23', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      missionTransitions: ['mission-1', 'mission-2'], humanInstructionsAfterSetup: 0,
      warmup, previousMission, resumedMission, qwenResponse: response.text, answer,
      deterministicPass, verified: passed,
      oracle: 'persisted relation type, direction and shared history must match the seeded evidence',
      durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S23', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      stage: warmup ? 'social-response' : 'model-warmup', warmup,
      previousMission, resumedMission, deterministicPass, verified: false,
      durationMs: Date.now() - startedAt };
    saveResult(result, deterministicOnly ? 'S23-genos-result.json' : 'S23-result.json');
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
