'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const policy = require('../../backend/src/services/communication/communicationPolicyEngine');
const { executeLiveCycle } = require('../../backend/src/services/communication/liveCycleExecution');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { recipients: ['agent-b', 'agent-c'], excluded: ['agent-d'], semanticRefs: ['hazard:bridge-closed'] };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { recipients: value.recipients, acknowledgements: value.acknowledgements,
    semanticRefs: value.semanticRefs };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S17-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name, status) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld', 'active')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  for (const [id, name, mode, status] of [
    ['agent-a', 'A', 'orchestrator', 'idle'], ['agent-b', 'B', 'worker', 'idle'],
    ['agent-c', 'C', 'worker', 'running'], ['agent-d', 'D', 'worker', 'unverified']
  ]) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, 'worker', status, mode, 'socialworld-space']);
  }
}

async function decideAnnouncement(db) {
  const intent = { senderAgentId: 'agent-a', purpose: 'warn', risk: 'high', urgency: 0.95,
    domain: 'safety', requiresAction: true, semanticRefs: ['hazard:bridge-closed'],
    payload: { alert: 'Bridge closed; use the eastern route.' } };
  const decision = await policy.decideCommunication({ db, intent, allowGlobal: true,
    maxCost: 50, maxCandidates: 10, independenceThreshold: 0.5,
    coefficients: { tokenInPer1k: 0, tokenOutPer1k: 0, cognitiveWake: 0,
      fanoutPerRecipient: 0, contaminationPerUnit: 0, disclosurePerUnit: 0 } });
  let delivered = null;
  const outcome = await executeLiveCycle({ db, decision, intent, opts: { cycleId: 's17-broadcast',
    transport: { deliver: async (input) => {
      delivered = input;
      return { published: true, signalId: input.envelope.messageId,
        acknowledgements: input.envelope.recipientAgentIds.map((recipientAgentId) => ({
          recipientAgentId, groundingLevel: 'verified_ack', status: 'acked', evidenceHash: 'sha256:verified'
        })) };
    } } } });
  return { intent, decision, outcome, delivered };
}

async function warmModel(seed) {
  const response = await modelProvider.generate({ model: MODEL, prompt: 'Reply with ready', seed,
    temperature: 0, enforceSchema: false, stream: false, maxTokens: 10, timeoutMs: 180000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  return { response: response.text };
}

async function askQwen(observed, seed) {
  const response = await modelProvider.generate({ model: MODEL,
    prompt: ['Copy the exact recipients, acknowledgements and semanticRefs from this GenOS broadcast.',
      `Broadcast record: ${JSON.stringify(observed)}`,
      'Return JSON with recipients, acknowledgements (one recipient ID per acknowledgment), and semanticRefs.'].join('\n\n'),
    seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  return { response: response.text, answer: parseAnswer(response.text) };
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  let db;
  let decision = null;
  let outcome = null;
  let observed = null;
  let enginePass = false;
  let warmup = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    const result = await decideAnnouncement(db);
    decision = result.decision;
    outcome = result.outcome;
    observed = { recipients: result.delivered.envelope.recipientAgentIds,
      acknowledgements: outcome.deliveryAcknowledgements.map((ack) => ack.recipientAgentId),
      semanticRefs: result.delivered.envelope.semanticRefs };
    enginePass = decision.scope === 'GLOBAL_BROADCAST'
      && JSON.stringify(observed.recipients) === JSON.stringify(EXPECTED.recipients)
      && !observed.recipients.includes('agent-d')
      && new Set(observed.recipients).size === observed.recipients.length
      && JSON.stringify(observed.acknowledgements) === JSON.stringify(EXPECTED.recipients)
      && outcome.grounding.satisfied
      && JSON.stringify(observed.semanticRefs) === JSON.stringify(EXPECTED.semanticRefs);
    warmup = await warmModel(seed);
    const { response, answer } = await askQwen(observed, seed);
    const qwenPass = JSON.stringify(answer) === JSON.stringify(observed);
    const passed = enginePass && qwenPass;
    const report = { campaignId: 'socialworld-qwen-20261022', scenario: 'S17', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      observed, decision, outcome, warmup, qwenResponse: response, answer,
      humanInstructionsAfterSetup: 0, enginePass, verified: passed,
      oracle: 'a global safety announcement reaches eligible project workers once each with verified acknowledgements',
      durationMs: Date.now() - startedAt };
    saveResult(report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const report = { campaignId: 'socialworld-qwen-20261022', scenario: 'S17', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      stage: observed ? warmup ? 'qwen-verification' : 'qwen-warmup' : 'genos-broadcast',
      observed, decision, outcome, enginePass, warmup, verified: false,
      durationMs: Date.now() - startedAt };
    saveResult(report);
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (db) await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
