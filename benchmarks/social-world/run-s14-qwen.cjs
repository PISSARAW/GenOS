'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const transactiveMemory = require('../../backend/src/services/communication/transactiveMemoryService');
const checkpoint = require('../../backend/src/services/communication/communicationCheckpointService');
const curiosity = require('../../backend/src/services/curiosityExplorerService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';

function parseQuestion(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const answer = JSON.parse(match[0]);
  return { topic: answer.topic, question: answer.question };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S14-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

function selectNeighborSkill() {
  const domains = [
    { domainId: 'neighbor:agent-b:cartography', seenCount: 0, errorHistory: [],
      predictionVariance: 0.7, totalAffordanceCount: 4, knownAffordanceCount: 0,
      testedAffordanceCount: 0, cost: 0.05, risk: 0.1 },
    { domainId: 'neighbor:agent-b:personal-life', seenCount: 5, errorHistory: [0.9, 0.99, 0.9],
      predictionVariance: 0.99, totalAffordanceCount: 1, cost: 1, risk: 1 }
  ];
  return curiosity.selectCuriousDomain(domains, { availableTokens: 1000, risk: 0.1 });
}

async function askNeighbor(skillDomain, seed) {
  const topic = skillDomain.split(':').at(-1);
  const response = await modelProvider.generate({ model: MODEL,
    prompt: ['You are agent A. A new neighbor arrived; their skill is unknown.',
      `GenOS selected this useful topic to explore: ${topic}.`,
      'Ask one concise, optional, non-assumptive question about this skill. Do not ask about personal life.',
      `Return JSON with topic exactly ${topic} and one question string.`].join('\n\n'),
    seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 90000,
    organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
  return { response: response.text, answer: parseQuestion(response.text), topic };
}

async function createWorld(db) {
  await transactiveMemory.ensureTables(db);
  await db.run("INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier) VALUES ('agent-a', 'A', 'worker', 'idle', 100, 'Flash')");
  await db.run("INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier) VALUES ('agent-b', 'B', 'worker', 'idle', 100, 'Flash')");
  await db.run("INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration) VALUES ('agent-b', 'cartography', 0.8, 0.8, 0.8)");
  await relations.createRelation({ db, id: 's14-neighbor', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'neighbor', relationClass: 'social', organizationId: 'socialworld-org',
    projectId: 'socialworld-project', metadata: { familiarity: 0.1, disclosureLevel: 0.4 } });
}

async function contactNeighbor(db, question) {
  let delivered = null;
  const receipt = await checkpoint.evaluateCheckpoint({ db, agentId: 'agent-a', checkpoint: 'CAPABILITY_MISSING',
    evidence: { domain: 'cartography', artifactId: 'neighbor-skill-question-14',
      semanticRefs: ['question:neighbor:cartography'], publicSummary: question },
    scope: { organizationId: 'socialworld-org', projectId: 'socialworld-project' },
    communication: { cycleId: 's14-curiosity', transport: { deliver: async (input) => {
      delivered = input;
      return { published: true, signalId: input.envelope.messageId, acknowledgements: [] };
    } } } });
  return { receipt, delivered };
}

function observedMessage(receipt, delivered) {
  return { action: receipt.decision.action, recipients: receipt.decision.recipients || [],
    semanticRefs: delivered?.envelope?.semanticRefs || [],
    publicSummary: delivered?.payload?.content?.content?.publicSummary || null };
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  let db;
  let selection = null;
  let questionResult = null;
  let observed = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    selection = selectNeighborSkill();
    if (!selection || selection.selectedDomainId !== 'neighbor:agent-b:cartography') {
      throw new Error(`Curiosity selected ${selection?.selectedDomainId || 'no domain'} for the new neighbor.`);
    }
    questionResult = await askNeighbor(selection.selectedDomainId, seed);
    if (questionResult.answer.topic !== questionResult.topic || !questionResult.answer.question) {
      throw new Error('Qwen did not produce a question for the selected neighbor skill.');
    }
    const { receipt, delivered } = await contactNeighbor(db, questionResult.answer.question);
    observed = observedMessage(receipt, delivered);
    const questionCount = (questionResult.answer.question.match(/\?/g) || []).length;
    const passed = observed.action === 'SIGNAL'
      && JSON.stringify(observed.recipients) === JSON.stringify(['agent-b'])
      && JSON.stringify(observed.semanticRefs) === JSON.stringify(['question:neighbor:cartography'])
      && observed.publicSummary === questionResult.answer.question
      && questionCount === 1
      && questionResult.answer.question.split(/\s+/).length <= 35;
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S14', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit,
      selectedDomain: selection, qwenResponse: questionResult.response,
      qwenQuestion: questionResult.answer, observed, questionCount,
      humanInstructionsAfterSetup: 0, verified: passed,
      oracle: 'curiosity selects one useful unknown neighbor skill and sends one optional question only to that neighbor',
      durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S14', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      selectedDomain: selection, qwenQuestion: questionResult?.answer, observed,
      stage: observed ? 'delivery-verification' : selection ? 'qwen-question' : 'curiosity-selection',
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result);
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (db) await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
