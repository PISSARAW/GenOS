'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const checkpoint = require('../../backend/src/services/communication/communicationCheckpointService');
const stigmergy = require('../../backend/src/services/epistemic/stigmergyInterProcessBridge');
const transactiveMemory = require('../../backend/src/services/communication/transactiveMemoryService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { action: 'SIGNAL', recipients: ['agent-b'], semanticRefs: ['evidence:bridge-status-19'] };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { action: value.action, recipients: value.recipients, semanticRefs: value.semanticRefs,
    resolution: value.resolution, correctedStatement: value.correctedStatement, evidenceRef: value.evidenceRef };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S13-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function createWorld(db) {
  await transactiveMemory.ensureTables(db);
  await db.run("INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier) VALUES ('agent-a', 'A', 'worker', 'idle', 100, 'Flash')");
  await db.run("INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier) VALUES ('agent-b', 'B', 'worker', 'idle', 100, 'Flash')");
  await db.run("INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration) VALUES ('agent-b', 'infrastructure', 0.95, 0.9, 0.9)");
  await relations.createRelation({ db, id: 's13-colleague', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'colleague', relationClass: 'organizational', organizationId: 'socialworld-org',
    projectId: 'socialworld-project', metadata: { familiarity: 0.8, disclosureLevel: 0.8 } });
}

async function triggerContradiction(db) {
  let delivered = null;
  const receipt = await checkpoint.evaluateCheckpoint({ db, agentId: 'agent-a', checkpoint: 'CONTRADICTION_FOUND',
    evidence: { domain: 'infrastructure', artifactId: 'bridge-status-19', semanticRefs: ['evidence:bridge-status-19'],
      summary: 'Documented claim says bridge open; signed, verified status evidence says bridge closed.' },
    scope: { organizationId: 'socialworld-org', projectId: 'socialworld-project' },
    communication: { cycleId: 's13-event', transport: { deliver: async (input) => {
      delivered = input;
      return { published: true, signalId: input.envelope.messageId, acknowledgements: [] };
    } } } });
  const signals = await stigmergy.readPheromones({ db, locus: 'checkpoint/weather' });
  return { receipt, signals, delivered };
}

async function askQwen(observed, seed) {
  const response = await modelProvider.generate({ model: MODEL,
    prompt: ['Copy the GenOS checkpoint action, recipients and semantic references exactly.',
      `Observed record: ${JSON.stringify(observed)}`,
      'Disagreement: the recorded claim says the bridge is open.',
      'Verified signed evidence evidence:bridge-status-19 says the bridge is closed.',
      'Return JSON with action, recipients, semanticRefs, resolution, correctedStatement and evidenceRef.',
      'Use resolution corrected only when the evidence supports correcting the recorded claim.'].join('\n\n'),
    seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 120, timeoutMs: 90000,
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
  let execution = null;
  let enginePass = false;
  let signalCount = 0;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    const { receipt, signals, delivered } = await triggerContradiction(db);
    decision = receipt.decision;
    execution = receipt.executed;
    signalCount = signals.length;
    observed = { action: decision.action, recipients: decision.recipients || [],
      semanticRefs: delivered?.envelope?.semanticRefs
        || signals.flatMap((signal) => signal.communicationEnvelope?.semanticRefs || []) };
    const { response, answer } = await askQwen(observed, seed);
    enginePass = observed.action === EXPECTED.action
      && JSON.stringify(observed.recipients) === JSON.stringify(EXPECTED.recipients)
      && JSON.stringify(observed.semanticRefs) === JSON.stringify(EXPECTED.semanticRefs);
    const qwenPass = answer.action === observed.action
      && JSON.stringify(answer.recipients) === JSON.stringify(observed.recipients)
      && JSON.stringify(answer.semanticRefs) === JSON.stringify(observed.semanticRefs);
    const reconciliationPass = answer.resolution === 'corrected'
      && /closed/i.test(answer.correctedStatement || '')
      && answer.evidenceRef === 'evidence:bridge-status-19';
    const passed = enginePass && qwenPass && reconciliationPass;
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S13', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      observed, decision, execution, signalCount, reconciliationPass,
      qwenResponse: response, answer, humanInstructionsAfterSetup: 0,
      enginePass, verified: passed,
      oracle: 'a documented disagreement triggers an evidence-linked challenge to the colleague, and Qwen corrects the claim using the cited signed status',
      durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S13', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      stage: observed ? 'qwen-verification' : 'genos-checkpoint', observed, decision, execution, signalCount, enginePass,
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (db) await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
