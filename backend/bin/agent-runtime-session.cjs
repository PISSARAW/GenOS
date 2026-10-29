const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { cleanup, setupCodexHome } = require('./agent-runtime-home.cjs');
const codexRuntimeConfiguration = require('../src/services/codexRuntimeConfiguration');
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const workerRecovery = require('../src/services/workerFailureRecoveryService');
const agentIdentity = require('../src/services/agentIdentityService');
const agentConscience = require('../src/services/agentConscienceService');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');
const agentMemory = require('../src/services/agentMemoryContext');
const trajectoryService = require('../src/services/trajectoryService');
const { getDatabase } = require('../src/db');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const { compactStrategyContract, compactAutonomyPlan, buildAgentRuntimePrompt, appendCoordinationEvidence,
  buildAuthorityInstruction: buildRuntimeAuthorityInstruction } = require('./agent-runtime-prompt.cjs');
const { handleRuntimeClose } = require('./agent-runtime-close.cjs');
const events = require('./agent-runtime-events.cjs');
const runtimeStdio = require('./agent-runtime-stdio.cjs');
const { resolveCodexLaunch } = require('./codexLaunchResolver.cjs');
const sharedBudget = require('./codex-cli-shared-budget.cjs');
const { buildMcpServerEnvironment, serializeMcpServerEnvironment } = require('../src/services/agentRuntimeMcpConfiguration');
const { parseToolLease } = require('./agent-runtime-lease.cjs');
const workerMcpPreflight = require('./worker-mcp-inventory-preflight.cjs');

async function runSession(raw) {
  const mission = decodeMission(raw);
  if (!mission) return;
  mission.runtimeStartedAt = Date.now();
  try { await sharedBudget.assertSupported(mission); } catch (error) { sharedBudget.reject(error); return; }
  const data = parseMission(mission);
  if (!data) return;
  const state = await buildState(mission, data);
  if (mission.resumeCheckpointId) {
    state.resumeCodex = await require('../src/services/codexRuntimeCheckpoint').load(state);
  }
  await startRuntime(state);
}

function decodeMission(raw) {
  try {
    return decodeMissionInput(raw);
  } catch (error) {
    process.stderr.write(`Invalid mission payload (protobuf frame or JSON object): ${error.message}\n`);
    process.exitCode = 2;
    return null;
  }
}

function parseJson(text, fallback, emptyText) {
  try {
    return JSON.parse(text || emptyText);
  } catch (_) {
    return fallback;
  }
}

function resolveBin(primary, fallback) {
  const candidates = [primary, `${primary}.exe`, fallback, `${fallback}.exe`].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function resolveBinaries() {
  const workspace = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../..');
  const genosBinary = process.env.GENOS_BIN && fs.existsSync(process.env.GENOS_BIN)
    ? process.env.GENOS_BIN
    : resolveBin(path.resolve(__dirname, '../../target/release/genos'), path.resolve(__dirname, '../../target/debug/genos'));
  const mcpBinary = process.env.GENOS_MCP_BIN && fs.existsSync(process.env.GENOS_MCP_BIN)
    ? process.env.GENOS_MCP_BIN
    : resolveBin(path.resolve(__dirname, '../../target/release/genos-mcp'), path.resolve(__dirname, '../../target/debug/genos-mcp'));
  const orchestratorBridge = process.env.GENOS_ORCHESTRATOR_BRIDGE || path.resolve(__dirname, 'genos-orchestrate.cjs');
  return { workspace, genosBinary, mcpBinary, orchestratorBridge };
}

function parseMission(mission) {
  const strategyContract = parseJson(mission.strategyContractJson, {}, '{}');
  const autonomyPlan = parseJson(mission.autonomyPlanJson, {}, '{}');
  const toolLease = parseToolLease(mission.toolLeaseJson);
  if (!toolLease) return null;
  const genosCapsule = parseJson(mission.genosCapsuleJson, {}, '{}');
  const executionPolicy = parseJson(mission.executionPolicyJson, {}, '{}');
  const executionBudget = parseJson(mission.executionBudgetJson, {}, '{}');
  const capabilityManifest = parseJson(mission.capabilityManifestJson, null, 'null');
  const isWorker = mission.executionMode === 'worker';
  return {
    strategyContract,
    autonomyPlan,
    toolLease,
    capabilities: Array.isArray(mission.capabilities) ? mission.capabilities : [],
    capabilityManifest,
    genosCapsule,
    executionPolicy,
    executionBudget,
    allowedCommands: normalizeAllowedCommands(executionPolicy.allowedCommands) || [],
    allowFileEdits: executionPolicy.allowFileEdits === true,
    isWorker,
    executionMode: isWorker ? 'worker' : 'orchestrator',
    orchestratorAgentId: mission.orchestratorAgentId || mission.agentId || ''
  };
}

function resolveIdentity(mission) {
  const agentName = mission.name || mission.agentId;
  const identity = agentIdentity.findIdentityByName(agentName);
  const nameMeaning = mission.nameMeaning || (identity && identity.meaning) || 'Autonomous implementation agent';
  const selfIntro = agentIdentity.formatSelfIntroduction(agentName, nameMeaning, mission.role);
  return { agentName, nameMeaning, selfIntro };
}

function buildAuthorityInstruction(mission, isWorker, autonomyPlan) {
  return buildRuntimeAuthorityInstruction(mission, isWorker, autonomyPlan);
}

function createState(mission, data) {
  const identity = resolveIdentity(mission);
  const requiredTools = require('../src/services/agentRuntimeRequiredTools').requiredRuntimeTools(mission, data);
  const preflightObservedTools = data.isWorker ? [] : (mission.preflightObservedTools || [])
    .filter(tool => requiredTools.has(tool));
  return {
    ...data,
    mission,
    authorityInstruction: buildAuthorityInstruction(mission, data.isWorker, data.autonomyPlan),
    runtimeContract: compactStrategyContract(data.strategyContract, data.isWorker),
    runtimeAutonomyPlan: compactAutonomyPlan(data.autonomyPlan),
    capabilityManifest: data.capabilityManifest,
    agentName: identity.agentName,
    nameMeaning: identity.nameMeaning,
    selfIntro: identity.selfIntro,
    conscienceState: agentConscience.createConscienceState(),
    conscienceBlock: '',
    agentSelfBlock: '',
    memoryBlock: '',
    workerSelfBlock: '',
    prompt: '',
    db: null,
    hasAgentInDb: false,
    pendingConscienceOp: Promise.resolve(),
    requiredTools,
    observedTools: new Set(preflightObservedTools),
    buffer: '',
    stderr: '',
    networkDenied: false,
    finalReportText: '',
    recordedTurns: [],
    cleanedUp: false,
    budgetStopped: null,
    eventCount: 0,
    estimatedTokens: 0,
    exactTokens: 0,
    observedCostUsd: 0,
    latencyTimer: null,
    isolatedCodexHome: null,
    child: null,
    emit: emitEvent
  };
}

async function loadConscienceState(state) {
  try {
    state.db = await getDatabase();
    if (!state.mission.agentId) return;
    const row = await state.db.get('SELECT id FROM agents WHERE id = ?', state.mission.agentId);
    if (!row) return;
    state.hasAgentInDb = true;
    state.conscienceState = await agentConscience.loadConscienceState(state.db, state.mission.agentId);
  } catch (_) {}
}

async function loadMemoryBlock(state) {
  const memoryContext = require('../src/services/agentRuntimeAdapter/missionMemoryContext');
  const mission = state.mission.memoryContext || !state.mission.memoryContextJson
    ? state.mission
    : { ...state.mission, memoryContext: parseJson(state.mission.memoryContextJson, null) };
  if (memoryContext.isResolved(mission)) { state.memoryBlock = memoryContext.textForMission(mission); return; }
  try {
    state.memoryBlock = await agentMemory.formatCognitiveMemoryPrompt(state.agentName,
      state.mission.prompt || state.mission.currentTask, { historicalMemoryTokenBudget: state.mission.historicalMemoryTokenBudget,
        recallPhase: state.mission.recallPhase, situationalRecall: state.mission.situationalRecall,
        peekVesicles: state.mission.contextTokenBudget !== undefined && state.mission.contextTokenBudget !== null });
  } catch (_) {}
}

async function loadSelfBlocks(state) {
  try {
    const selfBlocks = require('../src/services/agentSelfBlocks');
    const blocks = await selfBlocks.loadUnifiedSelfBlocks(state.db, state.mission.agentId, {
      wantWorker: state.isWorker, workerRole: state.mission.role || 'worker',
      workerContext: { mission: state.mission.prompt, hypothesis: state.mission.hypothesis, capabilities: state.mission.capabilities }
    });
    state.agentSelfBlock = blocks.agentSelfBlock;
    state.workerSelfBlock = blocks.workerSelfBlock;
  } catch (_) {}
}

function buildPrompt(state) {
  return buildAgentRuntimePrompt({
    selfIntro: state.selfIntro,
    mission: state.mission,
    conscienceBlock: state.conscienceBlock,
    agentSelfBlock: state.agentSelfBlock,
    memoryBlock: state.memoryBlock,
    workerSelfBlock: state.workerSelfBlock,
    authorityInstruction: state.authorityInstruction,
    agentName: state.agentName,
    nameMeaning: state.nameMeaning,
    strategyContract: state.strategyContract,
    runtimeContract: state.runtimeContract,
    isWorker: state.isWorker,
    autonomyPlan: state.autonomyPlan,
    runtimeAutonomyPlan: state.runtimeAutonomyPlan,
    executionPolicy: state.executionPolicy,
    toolLease: state.toolLease,
    genosCapsule: state.genosCapsule,
    allowFileEdits: state.allowFileEdits,
    allowedCommands: state.allowedCommands,
    capabilityManifest: state.capabilityManifest,
    capabilities: state.capabilities,
    coordinationOwner: state.isWorker && workerMcpPreflight.continuousCoordination(state.mission) ? 'runtime' : 'none',
  });
}

async function buildState(mission, data) {
  const state = createState(mission, data);
  if (state.genosCapsule.sealPath) await require('../src/services/trinityCapsuleSeal').verify(state.genosCapsule);
  await loadConscienceState(state);
  state.conscienceBlock = agentConscience.formatConsciencePrompt(state.conscienceState);
  await loadMemoryBlock(state);
  await loadSelfBlocks(state);
  state.prompt = buildPrompt(state);
  if (mission.contextTokenBudget !== undefined && mission.contextTokenBudget !== null) {
    const vesicles = require('../src/services/agentMemoryVesicles');
    await vesicles.consumeVesicles(mission.agentId);
    if (state.agentName !== mission.agentId) await vesicles.consumeVesicles(state.agentName);
  }
  state.estimatedTokens = Math.ceil(Buffer.byteLength(state.prompt, 'utf8') / 4);
  return state;
}

function emitEvent(event) {
  return process.stdout.write(encodeEvent({ ...event, payloadJson: JSON.stringify(event.payload || {}) }));
}

function buildMcpConfig(binaries) {
  const mcpNodeScript = path.resolve(__dirname, '../../mcp/index.js');
  const mcpCommand = binaries.mcpBinary && fs.existsSync(binaries.mcpBinary)
    ? binaries.mcpBinary
    : (fs.existsSync(mcpNodeScript) ? process.execPath : null);
  const mcpArgs = mcpCommand === binaries.mcpBinary ? ['stdio'] : [mcpNodeScript];
  return { mcpCommand, mcpArgs };
}

function buildMcpServerArgs(state, binaries, mcp) {
  if (!mcp.mcpCommand) return [];
  const environment = buildMcpServerEnvironment({ state, binaries, sourceEnv: process.env });
  return [
    '-c', `mcp_servers.genos.command=${JSON.stringify(mcp.mcpCommand)}`,
    '-c', `mcp_servers.genos.args=${JSON.stringify(mcp.mcpArgs)}`,
    '-c', `mcp_servers.genos.cwd=${JSON.stringify(binaries.workspace)}`,
    '-c', `mcp_servers.genos.env=${serializeMcpServerEnvironment(environment)}`,
    '-c', `mcp_servers.genos.enabled_tools=${JSON.stringify(state.toolLease)}`,
    '-c', 'mcp_servers.genos.disabled_tools=["genos_orchestrate"]',
    '-c', 'mcp_servers.genos.startup_timeout_sec=30',
    '-c', 'mcp_servers.genos.tool_timeout_sec=120'
  ];
}

function buildSpawnEnv(state, isolatedCodexHome, isolatedTemp) {
  const { executionMode } = state;
  return {
    ...process.env,
    CODEX_HOME: isolatedCodexHome,
    TMP: isolatedTemp,
    TEMP: isolatedTemp,
    TMPDIR: isolatedTemp,
    GENOS_EXECUTION_MODE: executionMode,
    GENOS_AGENT_ID: state.mission.agentId,
    GENOS_ORCHESTRATOR_AGENT_ID: state.orchestratorAgentId,
    GENOS_MISSION_ID: state.mission.missionId || '',
    GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(state.allowedCommands),
    GENOS_ALLOW_FILE_EDITS: state.allowFileEdits ? 'true' : 'false',
    GENOS_SILENT_UPDATES: state.executionPolicy.silentUpdates === true ? 'true' : 'false'
  };
}

async function createInvocation(state, binaries) {
  const configuredExecutable = process.env.CODEX_EXECUTABLE || 'codex';
  const candidate = /[\\/]node(?:\.exe)?$/i.test(configuredExecutable) ? 'codex' : configuredExecutable;
  const codexLaunch = resolveCodexLaunch(candidate);
  const isolated = setupCodexHome();
  try {
    if (state.resumeCodex) {
      await require('../src/services/codexRuntimeCheckpoint').materialize(state.db,
        state.resumeCodex.row, { agentId: state.mission.agentId, home: isolated.home });
    }
  } catch (error) {
    fs.rmSync(isolated.root, { recursive: true, force: true });
    throw error;
  }
  const mcp = buildMcpConfig(binaries);
  const args = [...codexLaunch.args, 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-c', 'approval_policy="on-request"', '-c', 'approvals_reviewer="auto_review"'];
  args.push('-C', binaries.workspace);
  if (state.resumeCodex) args.push('resume', state.resumeCodex.checkpoint.threadId);
  args.push(...codexRuntimeConfiguration.commandOptions(state.mission));
  args.push(...buildMcpServerArgs(state, binaries, mcp));
  args.push('-');
  return { command: codexLaunch.command, args, codexHome: isolated.home,
    runtimeRoot: isolated.root, env: buildSpawnEnv(state, isolated.home, isolated.temp) };
}

async function spawnChild(state, binaries) {
  const invocation = await createInvocation(state, binaries);
  state.isolatedCodexHome = invocation.codexHome;
  state.isolatedRuntimeRoot = invocation.runtimeRoot;
  // Preserve TOML/JSON quoting and Windows paths as literal argv entries.
  state.child = spawn(invocation.command, invocation.args, {
    cwd: binaries.workspace,
    env: invocation.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
    shell: false
  });
}

function runMemoryPipeline(state) {
  return strategyAdapter.executePipelineWithFeedback(
    ['search_memory', 'compile_memory'],
    { agentId: state.mission.agentId, orchestratorId: state.orchestratorAgentId, task: state.mission.prompt }
  ).then((res) => {
    if (res && res.results && res.results.length) {
      state.emit({ eventType: 'AGENT_STEP', action: 'MEMORY_RETRIEVAL', detail: 'Strategy memory retrieval primitives executed.', payload: { results: res.results } });
    }
  }).catch(() => {});
}

function wireProcessEvents(state) {
  state.child.on('error', (error) => {
    state.emit({ eventType: 'AGENT_RUNTIME_ERROR', action: 'ERROR', detail: error.message, severity: 'error', status: 'error' });
    process.exitCode = 1;
    cleanup(state);
    process.exit(1);
  });
  state.child.on('close', (code, signal) => {
    return handleChildClose(state, code, signal);
  });
}

async function handleChildClose(state, code, signal) {
  if (code === 0 && !state.budgetStopped) {
    try { await require('../src/services/codexRuntimeCheckpoint').save(state); }
    catch (error) {
      state.emit({ eventType: 'AGENT_STEP', action: 'CHECKPOINT_UNAVAILABLE',
        detail: `Codex session checkpoint unavailable: ${error.message}`, severity: 'warning' });
    }
  }
  const ctx = require('./agent-runtime-close-context.cjs').buildCloseContext(state, code, signal);
  return handleRuntimeClose(ctx);
}
async function startRuntime(state) {
  const binaries = resolveBinaries();
  if (state.isWorker) {
    const inventory = await workerMcpPreflight.runWorkerMcpInventoryPreflight({ state, binaries, mcp: buildMcpConfig(binaries) });
    state.prompt = appendCoordinationEvidence(state.prompt, inventory.coordination);
    require('../src/services/agentRuntimeAdapter/missionPromptBudget')
      .assertMissionPromptBudget(state.mission, state.prompt);
    state.estimatedTokens = Math.ceil(Buffer.byteLength(state.prompt, 'utf8') / 4);
    state.emit({ eventType: 'AGENT_STEP', action: 'MCP_PREFLIGHT', detail: 'Worker MCP inventory verified.', payload: inventory });
  }
  await spawnChild(state, binaries);
  state.emit({ eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Codex implementation runtime accepted the mission.', status: 'running', currentTask: state.mission.prompt });
  runMemoryPipeline(state);
  const latencyLimit = events.budgetLimit(state, 'latencyMs');
  if (Number.isFinite(latencyLimit)) {
    state.latencyTimer = setTimeout(() => {
      events.stopForBudget(state, { dimension: 'latencyMs', observed: latencyLimit + 1, limit: latencyLimit });
    }, latencyLimit);
  }
  if (state.estimatedTokens > events.budgetLimit(state, 'tokens')) {
    setImmediate(() => {
      events.stopForBudget(state, { dimension: 'tokens', observed: state.estimatedTokens, limit: events.budgetLimit(state, 'tokens') });
    });
  }
  runtimeStdio.wireStdio(state);
  state.child.stdin.end(state.prompt);
  wireProcessEvents(state);
}
module.exports = { runSession, parseToolLease, buildAuthorityInstruction };
