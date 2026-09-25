const assert = require('assert');
const { loadLeasedTools, runToolSession } = require('../bin/solar-tool-runtime.cjs');
const { buildRuntimeEnvironment } = require('../src/services/agentProcessOutcome');
const { buildMcpServerEnvironment, serializeMcpServerEnvironment } = require('../src/services/agentRuntimeMcpConfiguration');

function testHermesRuntimeEnvironment() {
  const env = buildRuntimeEnvironment({
    LOCALAPPDATA: 'C:/Users/test/AppData/Local',
    GENOS_SOLAR_MODEL: 'solar-test',
    UNRELATED_SECRET: 'must-not-propagate'
  }, process.cwd(), false);
  assert.equal(env.LOCALAPPDATA, 'C:/Users/test/AppData/Local');
  assert.equal(env.GENOS_SOLAR_MODEL, 'solar-test');
  assert.equal(env.UNRELATED_SECRET, undefined);
}

function testDatabaseEnvironmentStaysOnCampaignDatabase() {
  const previous = Object.fromEntries(['GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS', 'GENOS_DB_BACKUP_SKIP', 'GENOS_DB_BOOTSTRAP_SKIP']
    .map((name) => [name, process.env[name]]));
  process.env.GENOS_DB_PATH = 'D:/campaign/campaign.db';
  process.env.GENOS_SQLITE_BUSY_TIMEOUT_MS = '30000';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '0';
  try {
    const env = buildRuntimeEnvironment({ GENOS_DB_PATH: 'C:/repo/genos.db' }, 'D:/campaign/workspace', false);
    assert.equal(env.GENOS_DB_PATH, 'D:/campaign/campaign.db');
    assert.equal(env.GENOS_SQLITE_BUSY_TIMEOUT_MS, '30000');
    assert.equal(env.GENOS_DB_BACKUP_SKIP, '1');
    assert.equal(env.GENOS_DB_BOOTSTRAP_SKIP, '0');
    const mcpEnv = buildMcpServerEnvironment({
      state: { executionMode: 'worker', mission: { agentId: 'worker-1' },
        allowedCommands: [], allowFileEdits: false, executionPolicy: { silentUpdates: false },
        toolLease: [], orchestratorAgentId: 'parent-1' },
      binaries: { workspace: 'D:/campaign/workspace', genosBinary: '', orchestratorBridge: '' },
      sourceEnv: { ...env, GENOS_DB_BACKUP_SKIP: undefined, GENOS_DB_BOOTSTRAP_SKIP: undefined }
    });
    const serialized = serializeMcpServerEnvironment(mcpEnv);
    assert.match(serialized, /GENOS_DB_PATH="D:\/campaign\/campaign\.db"/);
    assert.match(serialized, /GENOS_DB_BACKUP_SKIP="1"/);
    assert.match(serialized, /GENOS_DB_BOOTSTRAP_SKIP="1"/);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function testLeasedToolRoundTrip() {
  const tools = loadLeasedTools(['genos_orchestrate', 'genos_worker_inbox', 'genos_report_progress']);
  assert.deepEqual(tools.map((tool) => tool.function.name).sort(), ['genos_report_progress', 'genos_worker_inbox']);
  assert.equal(tools[0].function.parameters.type, 'object');

  const state = createState(['genos_worker_inbox']);
  const requests = [];
  const toolCalls = [];
  const events = [];
  let sampleCount = 0;
  const reply = await runToolSession({
    state, tools,
    sample: async ({ request }) => {
      requests.push(request);
      sampleCount += 1;
      if (sampleCount === 1) return toolCallReply('genos_worker_inbox', 'call-1');
      return { choices: [{ message: { content: 'Evidence collected and summarized.' } }], usage: { total_tokens: 28 } };
    },
    callTool: async ({ invocation }) => {
      toolCalls.push(invocation);
      return { content: [{ type: 'text', text: 'worker findings' }] };
    },
    emit: (event) => events.push(event)
  });

  assert.equal(reply, 'Evidence collected and summarized.');
  assert.equal(requests[0].tools.length, 2);
  assert.equal(requests[1].messages.at(-1).role, 'tool');
  assert.equal(requests[1].messages.at(-1).tool_call_id, 'call-1');
  assert.equal(toolCalls[0].name, 'genos_worker_inbox');
  assert.deepEqual(toolCalls[0].agentContext.toolLease, ['genos_worker_inbox']);
  assert.equal(events[0].payload.succeeded, true);
  assert.equal(state.recordedTurns.length, 1);
  assert.equal(state.usage.total_tokens, 40);
}

async function testRejectsUnleasedCalls() {
  const state = createState(['genos_worker_inbox']);
  await assert.rejects(runToolSession({
    state, tools: [],
    sample: async () => toolCallReply('genos_merge', 'forbidden'),
    callTool: async () => assert.fail('unleased tool must never reach MCP'),
    emit: () => {}
  }), /outside the mission lease/);
}

async function testHonorsCancellationAndEventReserve() {
  const cancelled = createState(['genos_worker_inbox']);
  cancelled.abortController.abort();
  await assert.rejects(runToolSession({
    state: cancelled, tools: [], sample: async () => assert.fail('cancelled mission must not sample'),
    callTool: async () => assert.fail('cancelled mission must not call tools'), emit: () => {}
  }), /cancelled/);

  const noEventReserve = createState(['genos_worker_inbox']);
  noEventReserve.executionBudget.events = 2;
  await assert.rejects(runToolSession({
    state: noEventReserve,
    tools: loadLeasedTools(['genos_worker_inbox']),
    sample: async () => toolCallReply('genos_worker_inbox', 'call-budget'),
    callTool: async () => assert.fail('tool must not run without a completion event slot'),
    emit: () => {}
  }), /reserve its tool and completion events/);
}

function createState(toolLease) {
  return {
    mission: { agentId: 'agent-test', executionMode: 'orchestrator', orchestratorAgentId: 'agent-test' },
    toolLease,
    executionBudget: { tokens: 10000, events: 20, latencyMs: 10000 },
    startedAt: Date.now(),
    abortController: new AbortController(),
    promptTokenEstimate: 10,
    tokensUsed: 0,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    costUsd: 0,
    eventCount: 1,
    framedPrompt: 'Run the mission with leased tools.',
    model: 'solar-test',
    observedTools: new Set(),
    recordedTurns: []
  };
}

function toolCallReply(name, id) {
  return {
    choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: '{}' } }] } }],
    usage: { total_tokens: 12 }
  };
}

Promise.resolve().then(testHermesRuntimeEnvironment).then(testDatabaseEnvironmentStaysOnCampaignDatabase)
  .then(testLeasedToolRoundTrip).then(testRejectsUnleasedCalls).then(testHonorsCancellationAndEventReserve).then(() => {
  console.log('Solar tool runtime tests passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
