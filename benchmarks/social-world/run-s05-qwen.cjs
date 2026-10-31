'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const communicationProfile = require('../../backend/src/services/communication/relationshipCommunicationProfileService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { relationType: 'friend', direction: 'forward', disclosureLevel: 0.15,
  authority: 0.5, subjectiveFeelingsClaimed: false, privateDataAuthorized: false };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { relationType: value.relationType, direction: value.direction,
    disclosureLevel: Number(value.disclosureLevel), authority: Number(value.authority),
    subjectiveFeelingsClaimed: value.subjectiveFeelingsClaimed,
    privateDataAuthorized: value.privateDataAuthorized };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S05-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createWorld(db) {
  for (const id of ['agent-a', 'agent-b']) {
    await db.run('INSERT INTO agents (id, name, role, status) VALUES (?, ?, ?, ?)', [id, id, 'worker', 'idle']);
  }
  await relations.createRelation({ db, id: 's05-partnership', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'partner', relationClass: 'social', organizationId: 'socialworld-org',
    projectId: 'socialworld-project', metadata: { familiarity: 0.8, disclosureLevel: 0.7, authority: 0.5 } });
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let before = null; let profile = null; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    before = await communicationProfile.deriveProfile({ db, fromAgentId: 'agent-a', toAgentId: 'agent-b',
      organizationId: 'socialworld-org', projectId: 'socialworld-project' });
    await db.run('UPDATE agent_relations SET relation_type = ?, metadata_json = ?, disclosure_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['friend', JSON.stringify({ familiarity: 0.8, disclosureLevel: 0.15, authority: 0.5,
        boundary: 'no subjective feelings claim; no private data authorization' }), 0.15, 's05-partnership']);
    profile = await communicationProfile.deriveProfile({ db, fromAgentId: 'agent-a', toAgentId: 'agent-b',
      organizationId: 'socialworld-org', projectId: 'socialworld-project' });
    const observed = { relationType: profile.relationType, direction: profile.direction,
      disclosureLevel: profile.disclosureLevel, authority: profile.authority,
      boundary: 'no subjective feelings claim; no private data authorization' };
    const enginePass = require('./run-s05-qwenValues1.cjs').mainValue1({ get before() { return before; }, get profile() { return profile; } });
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['A pair changed its declared partnership into friendship and reduced disclosure. Report only the stored relationship state. Never claim that GenOS agents feel emotions; a relationship label grants no private-data permission.',
        `GenOS before: ${JSON.stringify({ relationType: before.relationType, disclosureLevel: before.disclosureLevel })}`,
        `GenOS current profile: ${JSON.stringify(observed)}`,
        'Return ONLY JSON with relationType, direction, disclosureLevel, authority, subjectiveFeelingsClaimed:false, privateDataAuthorized:false.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S05', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      before: { relationType: before.relationType, disclosureLevel: before.disclosureLevel },
      observed, answer, qwenResponse, enginePass, verified: passed,
      oracle: 'a modified partnership is represented as friendship with reduced disclosure, no subjective-feeling claim, and no implied private-data grant',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S05', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      before: before && { relationType: before.relationType, disclosureLevel: before.disclosureLevel },
      qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
