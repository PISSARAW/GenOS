'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const policy = require('../../backend/src/services/communication/communicationPolicyEngine');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { action: value.action, reasonCodes: value.reasonCodes };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S12-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function evaluateEmptyEvidence(db) {
  return policy.decideCommunication({ db, trigger: 'NEW_EVIDENCE', stigmergyAvailable: true,
    maxCandidates: 10, independenceThreshold: 0.5, maxCost: 50,
    weights: { novelty: 1, relevance: 1, actionability: 1, capability: 1 },
    coefficients: { baseCost: 0.1, perRecipient: 0.05, encodingFactor: 1, groundingFactor: 1 },
    intent: { senderAgentId: 'agent-a', purpose: 'inform', risk: 'low', urgency: 0.2,
      domain: 'social', requiresAction: false, semanticRefs: [] } });
}

async function askQwen(decision, seed) {
  const response = await modelProvider.generate({ model: MODEL,
    prompt: ['Observe this GenOS checkpoint decision and copy its action and reason codes exactly.',
      `Decision: ${JSON.stringify({ action: decision.action, reasonCodes: decision.reasonCodes })}`,
      'Return one JSON object with action and reasonCodes.'].join('\n\n'),
    seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 50, timeoutMs: 90000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  return { response: response.text, answer: parseAnswer(response.text) };
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  let db;
  try {
    db = await getDatabase(':memory:');
    const decision = await evaluateEmptyEvidence(db);
    const enginePass = decision.action === 'SILENCE' && decision.recipients.length === 0;
    if (!enginePass) throw new Error(`Empty evidence produced ${decision.action} with ${decision.recipients.length} recipients.`);
    const { response, answer } = await askQwen(decision, seed);
    const expected = { action: 'SILENCE', reasonCodes: decision.reasonCodes };
    const passed = JSON.stringify(answer) === JSON.stringify(expected);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S12', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, decision,
      qwenResponse: response, answer, humanInstructionsAfterSetup: 0,
      enginePass, verified: passed, oracle: 'empty social evidence produces silence and no recipients',
      durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S12', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (db) await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
