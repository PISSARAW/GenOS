'use strict';

const assert = require('node:assert/strict');
const { assertMissionPromptBudget } = require('../src/services/agentRuntimeAdapter/missionPromptBudget');
const { attachMissionMemoryContext } = require('../src/services/agentRuntimeAdapter/missionLease');
const { buildAgentRuntimePrompt } = require('../bin/agent-runtime-prompt.cjs');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');
const memory = require('../src/services/agentMemoryContext');
const vesicles = require('../src/services/agentMemoryVesicles');

function verifyEstimator() {
  const prompt = 'évidence 🧪';
  const expected = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4);
  const accepted = assertMissionPromptBudget({ contextTokenBudget: expected }, prompt);
  assert.equal(accepted.estimatedInputTokens, expected);
  assert.equal(accepted.estimateMethod, 'ceil_utf8_bytes_div_4');
  assert.throws(() => assertMissionPromptBudget({ contextTokenBudget: expected - 1 }, prompt),
    { code: 'GENOS_CONTEXT_BUDGET_EXCEEDED' });
  assert.throws(() => assertMissionPromptBudget({ contextTokenBudget: '100' }, prompt),
    { code: 'GENOS_CONTEXT_BUDGET_INVALID' });
  assert.throws(() => assertMissionPromptBudget({ contextTokenBudget: 0x100000000 }, prompt),
    { code: 'GENOS_CONTEXT_BUDGET_INVALID' });
  assert.equal(assertMissionPromptBudget({}, prompt), null);
}

function verifyRuntimePromptAndTransport() {
  const decoded = decodeMission(encodeMission({ agentId: 'agent-test', prompt: 'Check evidence',
    contextTokenBudget: 150 }));
  assert.equal(decoded.contextTokenBudget, 150);
  const context = { selfIntro: 'GenOS worker', mission: decoded, conscienceBlock: '',
    memoryBlock: 'memory-source:4', authorityInstruction: 'Authority remains unchanged.',
    strategyContract: {}, runtimeContract: {}, autonomyPlan: {}, runtimeAutonomyPlan: {},
    executionPolicy: {}, toolLease: [], genosCapsule: {}, isWorker: false };
  const fullPrompt = buildAgentRuntimePrompt(context);
  assert.ok(fullPrompt.includes('memory-source:4'));
  assert.ok(fullPrompt.includes('Authority remains unchanged.'));
  assert.throws(() => buildAgentRuntimePrompt({ ...context,
    mission: { ...decoded, contextTokenBudget: 5 } }),
  { code: 'GENOS_CONTEXT_BUDGET_EXCEEDED' });
  assert.equal(decodeMission(encodeMission({ agentId: 'agent-test', prompt: 'x',
    contextTokenBudget: 0 })).contextTokenBudget, 0);
}

async function verifyNoSilentTruncation() {
  const originalFormat = memory.formatCognitiveMemoryPrompt;
  const originalConsume = vesicles.consumeVesicles;
  const memoryText = 'source:version-4 CONTRADICTION_AT_END';
  let reads = 0;
  let consumes = 0;
  memory.formatCognitiveMemoryPrompt = async (agentId, task, options) => {
    reads += 1;
    assert.equal(options.peekVesicles, true);
    return memoryText;
  };
  vesicles.consumeVesicles = async () => { consumes += 1; };
  try {
    const task = 'Verify the claim.';
    const rejected = { prompt: task, contextTokenBudget: 3 };
    await assert.rejects(attachMissionMemoryContext(rejected, 'agent-test'),
      { code: 'GENOS_CONTEXT_BUDGET_EXCEEDED' });
    assert.equal(reads, 0);
    assert.equal(consumes, 0);
    assert.equal(rejected.prompt, task);

    const memoryRejected = { prompt: task, contextTokenBudget: 10 };
    await assert.rejects(attachMissionMemoryContext(memoryRejected, 'agent-test'),
      { code: 'GENOS_CONTEXT_BUDGET_EXCEEDED' });
    assert.equal(reads, 1);
    assert.equal(consumes, 0);
    assert.equal(memoryRejected.prompt, task);

    const accepted = { prompt: task, contextTokenBudget: 100 };
    await attachMissionMemoryContext(accepted, 'agent-test');
    assert.equal(reads, 2);
    assert.equal(consumes, 0);
    assert.ok(accepted.prompt.includes(memoryText));
    assert.equal(accepted.memoryContextAttached, true);
    assert.equal(accepted.contextTokenEstimate.contextTokenBudget, 100);
    assert.ok(accepted.contextTokenEstimate.estimatedInputTokens <= 100);
  } finally {
    memory.formatCognitiveMemoryPrompt = originalFormat;
    vesicles.consumeVesicles = originalConsume;
  }
}

async function run() {
  verifyEstimator();
  verifyRuntimePromptAndTransport();
  await verifyNoSilentTruncation();
  console.log('Mission prompt context budget regressions passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
