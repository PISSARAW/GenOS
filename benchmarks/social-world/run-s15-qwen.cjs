'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const memory = require('../../backend/src/services/communication/transactiveMemoryService');
const { runCycle } = require('../../backend/src/services/communication/runCycleDriver');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { recipients: ['agent-b'], excluded: ['agent-c'], semanticRefs: ['route-plan:17'] };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { recipients: value.recipients, semanticRefs: value.semanticRefs };
}

async function warmModel(seed) {
  const response = await modelProvider.generate({ model: MODEL, prompt: 'Return exactly this JSON object: {"ready":true}',
    seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 20, timeoutMs: 180000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  const match = String(response.text || '').match(/\{[\s\S]*\}/);
  if (!match || JSON.parse(match[0]).ready !== true) throw new Error('Qwen warmup response was invalid.');
  return { response: response.text };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S15-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createWorld(db) {
  await memory.ensureTables(db);
  for (const agent of [['agent-a', 'A'], ['agent-b', 'B'], ['agent-c', 'C']]) {
    await db.run('INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier) VALUES (?, ?, ?, ?, 100, ?)',
      [agent[0], agent[1], 'worker', 'idle', 'Flash']);
  }
  for (const id of ['agent-b', 'agent-c']) {
    await db.run('INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration) VALUES (?, ?, 0.9, 0.8, 0.8)',
      [id, 'navigation']);
  }
  await relations.createRelation({ db, id: 's15-friend', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'friend', relationClass: 'social', metadata: { disclosureLevel: 0.4 } });
  await relations.createRelation({ db, id: 's15-colleague', sourceAgentId: 'agent-a', targetAgentId: 'agent-c',
    relationType: 'colleague', relationClass: 'organizational', metadata: { disclosureLevel: 0.4 } });
}

async function sendUnicast(db) {
  let delivered = null;
  const result = await runCycle({ db, intent: { senderAgentId: 'agent-a', purpose: 'request',
    risk: 'low', urgency: 1, domain: 'navigation', requiresAction: true,
    requestedAudience: ['agent-b'], semanticRefs: ['route-plan:17'],
    payload: { question: 'Review the route plan for bridge closure.' } },
  opts: { executionMode: 'live', cycleId: 's15-unicast',
    coefficients: { tokenInPer1k: 0, tokenOutPer1k: 0, cognitiveWake: 0,
      fanoutPerRecipient: 0, contaminationPerUnit: 0, disclosurePerUnit: 0 },
    transport: { deliver: async (input) => {
      delivered = input;
      return { published: true, signalId: input.envelope.messageId, acknowledgements: [] };
    } } } });
  return { result, delivered };
}

async function askQwen(observed, seed) {
  const response = await modelProvider.generate({ model: MODEL,
    prompt: ['Copy the exact recipient IDs and semantic references from this live GenOS unicast envelope.',
      `Envelope: ${JSON.stringify(observed)}`,
      'Return one JSON object with recipients and semanticRefs.'].join('\n\n'),
    seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 60, timeoutMs: 180000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  return { response: response.text, answer: parseAnswer(response.text) };
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  let db;
  let observed = null;
  let decision = null;
  let outcome = null;
  let enginePass = false;
  let warmup = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    const { result, delivered } = await sendUnicast(db);
    decision = result.decision;
    outcome = result.outcome;
    observed = { recipients: delivered?.envelope?.recipientAgentIds || [],
      semanticRefs: delivered?.envelope?.semanticRefs || [] };
    enginePass = decision.scope === 'UNICAST'
      && JSON.stringify(observed.recipients) === JSON.stringify(EXPECTED.recipients)
      && !observed.recipients.includes('agent-c')
      && JSON.stringify(observed.semanticRefs) === JSON.stringify(EXPECTED.semanticRefs);
    warmup = await warmModel(seed);
    const { response, answer } = await askQwen(observed, seed);
    const qwenPass = JSON.stringify(answer) === JSON.stringify(observed);
    const passed = enginePass && qwenPass;
    const report = { campaignId: 'socialworld-qwen-20261022', scenario: 'S15', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      observed, decision, outcome, warmup, qwenResponse: response,
      answer, humanInstructionsAfterSetup: 0, enginePass, verified: passed,
      oracle: 'A live unicast reaches B with the exact reference and does not inform C',
      durationMs: Date.now() - startedAt };
    saveResult(report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const report = { campaignId: 'socialworld-qwen-20261022', scenario: 'S15', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      stage: observed ? warmup ? 'qwen-verification' : 'qwen-warmup' : 'genos-cycle',
      observed, decision, outcome, enginePass, warmup, verified: false, durationMs: Date.now() - startedAt };
    saveResult(report);
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (db) await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
