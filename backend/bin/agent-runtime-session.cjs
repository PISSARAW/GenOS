const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
const { resolveCodexLaunch } = require('./codexLaunchResolver.cjs');

const ORCHESTRATOR_INSTRUCTION = 'You are the GenOS orchestrator. You own strategy selection, task decomposition, worker dispatch, evaluation, replay, promotion, and the current worker organization. The control plane evaluated the complete 78-strategy registry before producing this contract; use the selected portfolio rather than treating every strategy as mandatory. At every material scope change, new risk, repeated failure, or evidence that invalidates the current problem profile, reassess whether the active strategy still fits. Call genos_change_strategy with the current need and evidence-backed reason when it may not fit; the control plane will evaluate all 78 strategies, version the contract only when a different portfolio is better, and preserve the remaining budget. Do not switch merely for novelty or oscillate between equivalent portfolios. You may call genos_change_organization at any decision gate when evidence or mission needs justify a different topology or communication mode; record the reason and use genos_organization_state to verify the transition. Inspect the Trinity intent in the autonomous plan before dispatching workers. If Trinity was explicitly requested, use the three control-plane worlds already composed. If the user asked to be interviewed to create a plan, conduct the interview first and consider genos_trinity_launch only after the answers produce a sufficiently concrete shared mission; do not launch it merely because planning was mentioned. When a mission genuinely requires at least two distinct competency domains and Trinity is not the better shape, use the control-plane A-Team already composed in the plan; if none was composed, the token policy still permits it, and two or more specialists are necessary, call genos_a_team_preview once with two or three bounded subsystems and matching roles. Do not create an A-Team for a single-domain task, exceed the token policy, duplicate members already running, or combine A-Team and Trinity in the same three-slot garage. Before a risky mutation, retrieve negative knowledge or diagnose, snapshot/fork when comparing alternatives, evaluate evidence, and record the decision. Change strategy or organization only on evidence, keep parasite/adversarial branches isolated, and stop or reallocate branches using the token policy.';

async function runSession(raw) {
  const mission = decodeMission(raw);
  if (!mission) return;
  const data = parseMission(mission);
  if (!data) return;
  const state = await buildState(mission, data);
  startRuntime(state);
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
  if (!toolLease.length) {
    process.stderr.write('Invalid mission tool lease: at least one tool is required.\n');
    process.exitCode = 2;
    return null;
  }
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
  const isWorker = mission.executionMode === 'worker';
  return {
    strategyContract,
    autonomyPlan,
    toolLease,
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
    return `You are a GenOS worker dispatched by orchestrator ${mission.orchestratorAgentId}. Execute only this assigned mission. Do not select a new strategy contract, spawn peer agents, or promote a result. Use genos_organization_state to learn the current topology, genos_worker_inbox to receive permitted peer evidence, and genos_worker_publish to communicate only through that organization's enforced routing. Return final evidence to the orchestrator.`;
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
    agentName: identity.agentName,
    nameMeaning: identity.nameMeaning,
    selfIntro: identity.selfIntro,
    conscienceState: agentConscience.createConscienceState(),
    conscienceBlock: '',
    memoryBlock: '',
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

function buildPrompt(state) {
  return buildAgentRuntimePrompt({
    selfIntro: state.selfIntro,
    mission: state.mission,
    conscienceBlock: state.conscienceBlock,
    memoryBlock: state.memoryBlock,
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
    allowedCommands: state.allowedCommands
  });
}

async function buildState(mission, data) {
  const state = createState(mission, data);
  await loadConscienceState(state);
  state.conscienceBlock = agentConscience.formatConsciencePrompt(state.conscienceState);
  await loadMemoryBlock(state);
  state.prompt = buildPrompt(state);
  state.estimatedTokens = Math.ceil(Buffer.byteLength(state.prompt, 'utf8') / 4);
  return state;
}

function emitEvent(event) {
  return process.stdout.write(encodeEvent({ ...event, payloadJson: JSON.stringify(event.payload || {}) }));
}

function cleanup(state) {
  if (state.cleanedUp) return;
  state.cleanedUp = true;
  if (state.latencyTimer) clearTimeout(state.latencyTimer);
  fs.rmSync(state.isolatedCodexHome, { recursive: true, force: true });
}

function setupCodexHome() {
  const hostCodexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const isolatedCodexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-codex-'));
  const hostAuth = path.join(hostCodexHome, 'auth.json');
  if (fs.existsSync(hostAuth)) fs.copyFileSync(hostAuth, path.join(isolatedCodexHome, 'auth.json'));
  fs.writeFileSync(path.join(isolatedCodexHome, 'config.toml'), '[features]\nhooks = true\n', { mode: 0o600 });
  const policyHook = path.resolve(__dirname, 'genos-pre-tool-policy.cjs');
  fs.writeFileSync(path.join(isolatedCodexHome, 'hooks.json'), JSON.stringify({
    description: 'Enforce the execution policy attached to a GenOS mission.',
    hooks: { PreToolUse: [{ matcher: '^(Bash|apply_patch)$', hooks: [{ type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(policyHook)}`, timeout: 10 }] }] }
  }), { mode: 0o600 });
  return isolatedCodexHome;
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
  const { executionMode } = state;
  if (!mcp.mcpCommand) return [];
  return [
    '-c', `mcp_servers.genos.command=${JSON.stringify(mcp.mcpCommand)}`,
    '-c', `mcp_servers.genos.args=${JSON.stringify(mcp.mcpArgs)}`,
    '-c', `mcp_servers.genos.cwd=${JSON.stringify(binaries.workspace)}`,
    '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(binaries.workspace)},GENOS_BIN=${JSON.stringify(binaries.genosBinary || '')},GENOS_MCP_TOOL_TIMEOUT_MS="120000",GENOS_ORCHESTRATOR_BRIDGE=${JSON.stringify(binaries.orchestratorBridge)},GENOS_EXECUTION_MODE=${JSON.stringify(executionMode)},GENOS_AGENT_ID=${JSON.stringify(state.mission.agentId)},GENOS_ORCHESTRATOR_AGENT_ID=${JSON.stringify(state.orchestratorAgentId)},GENOS_ALLOWED_COMMANDS_JSON=${JSON.stringify(JSON.stringify(state.allowedCommands))},GENOS_ALLOW_FILE_EDITS=${JSON.stringify(state.allowFileEdits ? 'true' : 'false')},GENOS_SILENT_UPDATES=${JSON.stringify(state.executionPolicy.silentUpdates === true ? 'true' : 'false')},GENOS_MCP_LEASE=${JSON.stringify(state.toolLease.join(','))},GENOS_MCP_DISABLED_TOOLS="genos_orchestrate"}`,
    '-c', `mcp_servers.genos.enabled_tools=${JSON.stringify(state.toolLease)}`,
    '-c', 'mcp_servers.genos.disabled_tools=["genos_orchestrate"]',
    '-c', 'mcp_servers.genos.startup_timeout_sec=30',
    '-c', 'mcp_servers.genos.tool_timeout_sec=120'
  ];
}

function buildSpawnEnv(state, isolatedCodexHome) {
  const { executionMode } = state;
  return {
    ...process.env,
    CODEX_HOME: isolatedCodexHome,
    GENOS_EXECUTION_MODE: executionMode,
    GENOS_AGENT_ID: state.mission.agentId,
    GENOS_ORCHESTRATOR_AGENT_ID: state.orchestratorAgentId,
    GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(state.allowedCommands),
    GENOS_ALLOW_FILE_EDITS: state.allowFileEdits ? 'true' : 'false',
    GENOS_SILENT_UPDATES: state.executionPolicy.silentUpdates === true ? 'true' : 'false'
  };
}

function createInvocation(state, binaries) {
  const codexLaunch = resolveCodexLaunch(process.env.CODEX_EXECUTABLE || 'codex');
  const codexHome = setupCodexHome();
  const mcp = buildMcpConfig(binaries);
  const args = [...codexLaunch.args, 'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--dangerously-bypass-hook-trust', '-c', 'approval_policy="never"'];
  args.push(...codexRuntimeConfiguration.commandOptions(state.mission));
  args.push(...buildMcpServerArgs(state, binaries, mcp));
  args.push('-C', binaries.workspace, '-');
  return { command: codexLaunch.command, args, codexHome, env: buildSpawnEnv(state, codexHome) };
}

function spawnChild(state, binaries) {
  const invocation = createInvocation(state, binaries);
  state.isolatedCodexHome = invocation.codexHome;
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

function wireStdio(state) {
  state.child.stdout.on('data', (chunk) => {
    events.handleStdout(state, chunk);
  });
  state.child.stderr.on('data', (chunk) => {
    const detail = chunk.toString();
    state.stderr = `${state.stderr}${detail}`.slice(-4000);
    process.stderr.write(detail);
  });
  state.child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') process.stderr.write(`Runtime stdin error: ${error.message}\n`);
  });
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

function handleChildClose(state, code, signal) {
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

function startRuntime(state) {
  const binaries = resolveBinaries();
  spawnChild(state, binaries);
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
  wireStdio(state);
  state.child.stdin.end(state.prompt);
  wireProcessEvents(state);
}

module.exports = { runSession };
