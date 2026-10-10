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
const { compactStrategyContract, compactAutonomyPlan, buildAgentRuntimePrompt } = require('./agent-runtime-prompt.cjs');
const { handleRuntimeClose } = require('./agent-runtime-close.cjs');
const events = require('./agent-runtime-events.cjs');
const runtimeStdio = require('./agent-runtime-stdio.cjs');
const { resolveCodexLaunch } = require('./codexLaunchResolver.cjs');
const { buildMcpServerEnvironment, serializeMcpServerEnvironment } = require('../src/services/agentRuntimeMcpConfiguration');

const ORCHESTRATOR_INSTRUCTION = 'You are the GenOS orchestrator. You own strategy selection, task decomposition, worker dispatch, evaluation, replay, promotion, and the current worker organization. The control plane evaluated the complete strategy registry before producing this contract; use the selected portfolio rather than treating every strategy as mandatory. At every material scope change, new risk, repeated failure, or evidence that invalidates the current problem profile, reassess whether the active strategy still fits. Call genos_change_strategy with the current need and evidence-backed reason when it may not fit; the control plane will evaluate all strategies, version the contract only when a different portfolio is better, and preserve the remaining budget. Do not switch merely for novelty or oscillate between equivalent portfolios. You may call genos_change_organization at any decision gate when evidence or mission needs justify a different topology or communication mode; record the reason and use genos_organization_state to verify the transition. When a worker must use a named algorithm or specialized method, include worker_assignments keyed by topology role, with methodContract version 1 and methodId; include parameters, requiredEvidence, evaluator, and requiredCapabilities when the method needs a specific capability. Do not choose workerKind yourself: the control plane resolves it from role requirements and the method contract, and rejects incompatible combinations. Inspect the Trinity intent in the autonomous plan before dispatching workers. If Trinity was explicitly requested, use the three control-plane worlds already composed. If the user asked to be interviewed to create a plan, conduct the interview first and consider genos_trinity_launch only after the answers produce a sufficiently concrete shared mission; do not launch it merely because planning was mentioned. When a mission genuinely requires at least two distinct competency domains and Trinity is not the better shape, use the control-plane A-Team already composed in the plan; if none was composed, the token policy still permits it, and two or more specialists are necessary, call genos_a_team_preview once with two or three bounded subsystems and matching roles. Do not create an A-Team for a single-domain task, exceed the token policy, duplicate members already running, or combine A-Team and Trinity in the same three-slot garage. Before a risky mutation, retrieve negative knowledge or diagnose, snapshot/fork when comparing alternatives, evaluate evidence, and record the decision. Change strategy or organization only on evidence, keep parasite/adversarial branches isolated, and stop or reallocate branches using the token policy.';

async function runSession(raw) {
  const mission = decodeMission(raw);
  if (!mission) return;
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

function parseToolLease(rawJson) {
  let toolLease = parseJson(rawJson, [], '[]');
  if (!Array.isArray(toolLease) || toolLease.some((tool) => { return typeof tool !== 'string' || !tool.trim(); })) {
    process.stderr.write('Invalid mission tool lease: expected an array of non-empty tool names.\n');
    process.exitCode = 2;
    return null;
  }
  toolLease = [...new Set(toolLease.map((tool) => { return tool.trim(); }))];
  return toolLease;
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
  if (isWorker) {
    return `You are a GenOS worker dispatched by orchestrator ${mission.orchestratorAgentId}. Execute only this assigned mission. Do not select a new strategy contract, spawn peer agents, or promote a result. If leased and available, use genos_organization_state, genos_worker_inbox and genos_worker_publish through the organization's enforced routing. An unavailable tool is not a prerequisite for completing the assigned local task. Return final evidence to the orchestrator.`;
  }
  if (autonomyPlan.synthesisOnly) {
    return 'You are the GenOS orchestrator in the enforced final-synthesis phase. The control plane has already completed every delegated worker, continuation round, and recovery listed in the attached dossiers. Compare all dossiers and produce the one official result. Do not dispatch, preview, or launch any new worker or Trinity world during this phase.';
  }
  return ORCHESTRATOR_INSTRUCTION;
}

function createState(mission, data) {
  const identity = resolveIdentity(mission);
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
    requiredTools: new Set(data.isWorker ? [] : (data.autonomyPlan.mandatoryTools || [])),
    observedTools: new Set(),
    buffer: '',
    stderr: '',
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
  try {
    state.memoryBlock = await agentMemory.formatCognitiveMemoryPrompt(state.agentName, state.mission.prompt || state.mission.currentTask);
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
  return handleRuntimeClose({
    code, signal, budgetStopped: state.budgetStopped, emit: state.emit,
    cleanup: () => { cleanup(state); }, requiredTools: state.requiredTools, observedTools: state.observedTools,
    db: state.db, hasAgentInDb: state.hasAgentInDb, agentConscience, conscienceState: state.conscienceState,
    pendingConscienceOp: state.pendingConscienceOp, mission: state.mission, finalReportText: state.finalReportText,
    agentName: state.agentName, nameMeaning: state.nameMeaning, autonomyPlan: state.autonomyPlan, isWorker: state.isWorker,
    exactTokens: state.exactTokens, estimatedTokens: state.estimatedTokens, eventCount: state.eventCount,
    observedCostUsd: state.observedCostUsd, strategyContract: state.strategyContract, orchestratorAgentId: state.orchestratorAgentId,
    recordedTurns: state.recordedTurns, stderr: state.stderr
  });
}

async function startRuntime(state) {
  const binaries = resolveBinaries();
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

module.exports = { runSession, parseToolLease };
