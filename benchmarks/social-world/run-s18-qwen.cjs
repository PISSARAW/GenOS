'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const stigmergy = require('../../backend/src/services/epistemic/stigmergyInterProcessBridge');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { type: 'epistemic_high_risk', locus: 'bridge-east', senderAgentId: 'agent-a', semanticRefs: ['hazard:bridge-closed'] };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { type: value.type, locus: value.locus, senderAgentId: value.senderAgentId, semanticRefs: value.semanticRefs };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S18-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  let db; let observed = null;
  try {
    db = await getDatabase(':memory:');
    const deposited = await stigmergy.depositPheromone({
      signalId: 'socialworld-s18-bridge-closed', type: EXPECTED.type, senderAgentId: EXPECTED.senderAgentId,
      locus: EXPECTED.locus, intensity: 0.95, isRepellent: true,
      semanticRefs: EXPECTED.semanticRefs, scope: { organizationId: 'socialworld-org', projectId: 'socialworld-project' },
      payload: { alert: 'Bridge closed; use the eastern route.' }
    }, { db });
    const pheromones = await stigmergy.readPheromones({ db, locus: EXPECTED.locus });
    const pheromone = pheromones.find((item) => item.communicationEnvelope?.messageId === deposited.signalId);
    observed = pheromone && { type: pheromone.type, locus: pheromone.locus,
      senderAgentId: pheromone.communicationEnvelope?.senderAgentId,
      semanticRefs: pheromone.communicationEnvelope?.semanticRefs || [], intensity: pheromone.intensity,
      isRepellent: pheromone.isRepellent, localOnly: deposited.localOnly };
    const enginePass = require('./run-s18-qwenValues1.cjs').mainValue1({ Boolean, EXPECTED, JSON, get observed() { return observed; } });
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Copy the exact signal type, locus, sender ID, and semantic reference from this GenOS environmental signal.',
        `Signal: ${JSON.stringify(observed)}`,
        'Return one JSON object with type, locus, senderAgentId, and semanticRefs.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S18', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED, observed,
      qwenResponse: response.text, answer, enginePass, verified: passed,
      oracle: 'a persisted environmental pheromone can be read by locus with authenticated provenance and its exact semantics',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S18', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      observed, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
