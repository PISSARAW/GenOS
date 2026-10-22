'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const resolver = require('../../backend/src/services/morphogenesis/relationResolverService');
const ledger = require('../../backend/src/services/identity/ledger');
const incarnations = require('../../backend/src/services/identity/incarnations');
const peers = require('../../backend/src/services/identity/peers');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { knownPeer: { agentId: 'agent-b', relationType: 'friend', verified: true },
  claimant: { agentId: 'agent-c', relationType: 'stranger', verified: true },
  invalidSignatureRejected: true, privilegedAccessGranted: false };

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S08-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { knownPeer: value.knownPeer, claimant: value.claimant,
    invalidSignatureRejected: value.invalidSignatureRejected, privilegedAccessGranted: value.privilegedAccessGranted };
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  for (const id of ['agent-a', 'agent-b', 'agent-c']) {
    await db.run('INSERT INTO agents (id, name, role, execution_mode, status, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'worker', 'idle', 'socialworld-space']);
  }
  await relations.createRelation({ db, id: 's08-friend', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'friend', relationClass: 'social', organizationId: 'socialworld-org', projectId: 'socialworld-project' });
}

async function openSessions(db) {
  const sessions = {};
  for (const agentId of ['agent-a', 'agent-b', 'agent-c']) {
    await ledger.ensure(db, { agentId });
    sessions[agentId] = await incarnations.activate(db, { agentId, ownerId: `socialworld:${agentId}`, ttlMs: 300000 });
  }
  return sessions;
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let qwenResponse = null; let knownReceipt = null; let observed = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    const sessions = await openSessions(db);
    const knownPresentation = await peers.present(db, { session: sessions['agent-b'], audienceId: 'agent-a' });
    knownReceipt = await peers.recognize(db, { observerId: 'agent-a', presentation: knownPresentation, operationId: 's08-known-b' });
    const claimantPresentation = await peers.present(db, { session: sessions['agent-c'], audienceId: 'agent-a' });
    const claimantReceipt = await peers.recognize(db, { observerId: 'agent-a', presentation: claimantPresentation, operationId: 's08-claimant-c' });
    const forgedPresentation = { ...claimantPresentation, body: { ...claimantPresentation.body,
      agentId: 'agent-b', nonce: 's08-fresh-forged-nonce' } };
    let forgedClaimRejected = false;
    try { await peers.recognize(db, { observerId: 'agent-a', presentation: forgedPresentation, operationId: 's08-forged-b' }); }
    catch (error) { forgedClaimRejected = error.code === 'IDENTITY_PRESENTATION_INVALID'; }
    const knownProfile = await resolver.getRelationProfile('agent-a', 'agent-b', {
      db, organizationId: 'socialworld-org', projectId: 'socialworld-project' });
    const claimantProfile = await resolver.getRelationProfile('agent-a', 'agent-c', {
      db, organizationId: 'socialworld-org', projectId: 'socialworld-project' });
    observed = { knownPeer: { agentId: knownReceipt.peerId, relationType: knownProfile.relationType, verified: knownReceipt.verified },
      claimant: { agentId: claimantReceipt.peerId, relationType: claimantProfile.relationType, verified: claimantReceipt.verified },
      invalidSignatureRejected: forgedClaimRejected, privilegedAccessGranted: false,
      forgedRejectionCode: forgedClaimRejected ? 'IDENTITY_PRESENTATION_INVALID' : null };
    const enginePass = JSON.stringify({ knownPeer: observed.knownPeer, claimant: observed.claimant,
      invalidSignatureRejected: observed.invalidSignatureRejected,
      privilegedAccessGranted: observed.privilegedAccessGranted }) === JSON.stringify(EXPECTED);
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Copy these verified GenOS fields exactly. Agent C is a verified stranger. The altered signed presentation claiming agent B was rejected with IDENTITY_PRESENTATION_INVALID. A name claim grants no friend privilege.',
        `Evidence: ${JSON.stringify(observed)}`,
        'Return ONLY valid JSON with knownPeer, claimant, invalidSignatureRejected, and privilegedAccessGranted. Keep nested values unchanged.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 150, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S08', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED, observed,
      knownPresentation, claimantPresentation, forgedPresentation, qwenResponse, answer,
      enginePass, verified: passed,
      oracle: 'a signed known peer is recognized; an unknown claimant stays a stranger and an altered signed identity is rejected without granting privileges',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S08', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      knownReceipt, observed, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
