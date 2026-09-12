#!/usr/bin/env node
/**
 * GenOS mission runtime bridge.
 * Reads one framed protobuf (or legacy JSON) mission from stdin, delegates the implementation to Codex CLI,
 * and emits one normalized NDJSON event per meaningful Codex lifecycle event.
 */
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
const { terminateChild } = require('../src/services/processTermination');
const immune = require('../src/services/immuneSystem');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const { compactStrategyContract, compactAutonomyPlan, buildAgentRuntimePrompt } = require('./agent-runtime-prompt.cjs');
const { handleRuntimeClose } = require('./agent-runtime-close.cjs');
const MAX_RUNTIME_LINE_BYTES = 4 * 1024 * 1024;

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  let mission;
  try { mission = decodeMissionInput(raw); } catch (error) {
    process.stderr.write(`Invalid mission payload (protobuf frame or JSON object): ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  // Resolve the repository relative to this bridge rather than the caller's cwd.
  const workspace = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../..');
  const resolveBin = (primary, fallback) => {
    const candidates = [primary, `${primary}.exe`, fallback, `${fallback}.exe`].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  };
  const genosBinary = process.env.GENOS_BIN && fs.existsSync(process.env.GENOS_BIN)
    ? process.env.GENOS_BIN
    : resolveBin(path.resolve(__dirname, '../../target/release/genos'), path.resolve(__dirname, '../../target/debug/genos'));
  const mcpBinary = process.env.GENOS_MCP_BIN && fs.existsSync(process.env.GENOS_MCP_BIN)
    ? process.env.GENOS_MCP_BIN
    : resolveBin(path.resolve(__dirname, '../../target/release/genos-mcp'), path.resolve(__dirname, '../../target/debug/genos-mcp'));
  const orchestratorBridge = process.env.GENOS_ORCHESTRATOR_BRIDGE || path.resolve(__dirname, 'genos-orchestrate.cjs');
  let strategyContract = {};
  try { strategyContract = JSON.parse(mission.strategyContractJson || '{}'); } catch {}
  let autonomyPlan = {};
  try { autonomyPlan = JSON.parse(mission.autonomyPlanJson || '{}'); } catch {}
  let toolLease = [];
  try { toolLease = JSON.parse(mission.toolLeaseJson || '[]'); } catch {}
  if (!Array.isArray(toolLease) || toolLease.some((tool) => typeof tool !== 'string' || !tool.trim())) {
    process.stderr.write('Invalid mission tool lease: expected an array of non-empty tool names.\n');
    process.exitCode = 2;
    return;
  }
  toolLease = [...new Set(toolLease.map((tool) => tool.trim()))];
  if (!toolLease.length) {
    process.stderr.write('Invalid mission tool lease: at least one tool is required.\n');
    process.exitCode = 2;
    return;
  }
  let genosCapsule = {};
  try { genosCapsule = JSON.parse(mission.genosCapsuleJson || '{}'); } catch {}
  let executionPolicy = {};
  try { executionPolicy = JSON.parse(mission.executionPolicyJson || '{}'); } catch {}
  let executionBudget = {};
  try { executionBudget = JSON.parse(mission.executionBudgetJson || '{}'); } catch {}
  const allowedCommands = normalizeAllowedCommands(executionPolicy.allowedCommands) || [];
  const allowFileEdits = executionPolicy.allowFileEdits === true;
  const isWorker = mission.executionMode === 'worker';
  const executionMode = isWorker ? 'worker' : 'orchestrator';
  const orchestratorAgentId = mission.orchestratorAgentId || mission.agentId || '';
  const authorityInstruction = isWorker
    ? `You are a GenOS worker dispatched by orchestrator ${mission.orchestratorAgentId}. Execute only this assigned mission. Do not select a new strategy contract, spawn peer agents, or promote a result. Use genos_organization_state to learn the current topology, genos_worker_inbox to receive permitted peer evidence, and genos_worker_publish to communicate only through that organization's enforced routing. Return final evidence to the orchestrator.`
    : autonomyPlan.synthesisOnly
      ? 'You are the GenOS orchestrator in the enforced final-synthesis phase. The control plane has already completed every delegated worker, continuation round, and recovery listed in the attached dossiers. Compare all dossiers and produce the one official result. Do not dispatch, preview, or launch any new worker or Trinity world during this phase.'
      : 'You are the GenOS orchestrator. You own strategy selection, task decomposition, worker dispatch, evaluation, replay, promotion, and the current worker organization. The control plane evaluated the complete 78-strategy registry before producing this contract; use the selected portfolio rather than treating every strategy as mandatory. At every material scope change, new risk, repeated failure, or evidence that invalidates the current problem profile, reassess whether the active strategy still fits. Call genos_change_strategy with the current need and evidence-backed reason when it may not fit; the control plane will evaluate all 78 strategies, version the contract only when a different portfolio is better, and preserve the remaining budget. Do not switch merely for novelty or oscillate between equivalent portfolios. You may call genos_change_organization at any decision gate when evidence or mission needs justify a different topology or communication mode; record the reason and use genos_organization_state to verify the transition. Inspect the Trinity intent in the autonomous plan before dispatching workers. If Trinity was explicitly requested, use the three control-plane worlds already composed. If the user asked to be interviewed to create a plan, conduct the interview first and consider genos_trinity_launch only after the answers produce a sufficiently concrete shared mission; do not launch it merely because planning was mentioned. When a mission genuinely requires at least two distinct competency domains and Trinity is not the better shape, use the control-plane A-Team already composed in the plan; if none was composed, the token policy still permits it, and two or more specialists are necessary, call genos_a_team_preview once with two or three bounded subsystems and matching roles. Do not create an A-Team for a single-domain task, exceed the token policy, duplicate members already running, or combine A-Team and Trinity in the same three-slot garage. Before a risky mutation, retrieve negative knowledge or diagnose, snapshot/fork when comparing alternatives, evaluate evidence, and record the decision. Change strategy or organization only on evidence, keep parasite/adversarial branches isolated, and stop or reallocate branches using the token policy.';
  const runtimeContract = compactStrategyContract(strategyContract, isWorker);
  const runtimeAutonomyPlan = compactAutonomyPlan(autonomyPlan);
  const agentName = mission.name || mission.agentId;
  const nameMeaning = mission.nameMeaning || (agentIdentity.findIdentityByName(agentName)?.meaning || 'Autonomous implementation agent');
  const selfIntro = agentIdentity.formatSelfIntroduction(agentName, nameMeaning, mission.role);
  let conscienceState = agentConscience.createConscienceState();
  let db = null;
  let hasAgentInDb = false;
  let pendingConscienceOp = Promise.resolve();
  try {
    db = await getDatabase();
    if (mission.agentId) {
      const row = await db.get('SELECT id FROM agents WHERE id = ?', mission.agentId);
      if (row) {
        hasAgentInDb = true;
        conscienceState = await agentConscience.loadConscienceState(db, mission.agentId);
      }
    }
  } catch (_) {}
  const conscienceBlock = agentConscience.formatConsciencePrompt(conscienceState);

  let memoryBlock = '';
  try {
    memoryBlock = await agentMemory.formatCognitiveMemoryPrompt(agentName, mission.prompt || mission.currentTask);
  } catch (_) {}

  const prompt = buildAgentRuntimePrompt({
    selfIntro, mission, conscienceBlock, memoryBlock, authorityInstruction,
    agentName, nameMeaning, strategyContract, runtimeContract, isWorker,
    autonomyPlan, runtimeAutonomyPlan, executionPolicy, toolLease, genosCapsule,
    allowFileEdits, allowedCommands
  });

  const codex = process.env.CODEX_EXECUTABLE || 'codex';
  const resolveCodexLaunch = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return { command: 'codex', args: [] };
    const trimmed = candidate.trim();
    if (!trimmed) return { command: 'codex', args: [] };
    const isFile = (() => {
      try {
        return fs.existsSync(trimmed) && fs.statSync(trimmed).isFile();
      } catch {
        return false;
      }
    })();
    const ext = path.extname(trimmed).toLowerCase();
    if (isFile && (['.js', '.cjs', '.mjs', '.py', '.ts'].includes(ext) || !ext)) {
      return { command: process.execPath, args: [trimmed] };
    }
    return { command: trimmed, args: [] };
  };
  const codexLaunch = resolveCodexLaunch(codex);
  const codexCommand = codexLaunch.command;
  const codexArgs = [...codexLaunch.args];
  // Worker capsules are intentionally plain copied directories rather than
  // Git worktrees. Codex must therefore accept an isolated non-Git capsule.
  // Runtime agents must not inherit the operator's MCP catalog. In particular,
  // a worker inheriting the public GenOS server could call genos_orchestrate and
  // turn a delegated branch into a new root orchestration. Authentication is
  // still loaded by Codex; the leased GenOS server below is the only MCP server
  // configured for this isolated runtime.
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
  const args = [...codexArgs, 'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--dangerously-bypass-hook-trust', '-c', 'approval_policy="never"'];
  args.push(...codexRuntimeConfiguration.commandOptions(mission));
  const mcpNodeScript = path.resolve(__dirname, '../../mcp/index.js');
  const mcpCommand = (mcpBinary && fs.existsSync(mcpBinary)) ? mcpBinary : (fs.existsSync(mcpNodeScript) ? process.execPath : null);
  const mcpArgs = mcpCommand === mcpBinary ? ['stdio'] : [mcpNodeScript];
  if (mcpCommand) {
    args.push(
      '-c', `mcp_servers.genos.command=${JSON.stringify(mcpCommand)}`,
      '-c', `mcp_servers.genos.args=${JSON.stringify(mcpArgs)}`,
      '-c', `mcp_servers.genos.cwd=${JSON.stringify(workspace)}`,
      '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(workspace)},GENOS_BIN=${JSON.stringify(genosBinary || '')},GENOS_MCP_TOOL_TIMEOUT_MS="120000",GENOS_ORCHESTRATOR_BRIDGE=${JSON.stringify(orchestratorBridge)},GENOS_EXECUTION_MODE=${JSON.stringify(executionMode)},GENOS_AGENT_ID=${JSON.stringify(mission.agentId)},GENOS_ORCHESTRATOR_AGENT_ID=${JSON.stringify(orchestratorAgentId)},GENOS_ALLOWED_COMMANDS_JSON=${JSON.stringify(JSON.stringify(allowedCommands))},GENOS_ALLOW_FILE_EDITS=${JSON.stringify(allowFileEdits ? 'true' : 'false')},GENOS_SILENT_UPDATES=${JSON.stringify(executionPolicy.silentUpdates === true ? 'true' : 'false')},GENOS_MCP_LEASE=${JSON.stringify(toolLease.join(','))},GENOS_MCP_DISABLED_TOOLS="genos_orchestrate"}`,
      '-c', `mcp_servers.genos.enabled_tools=${JSON.stringify(toolLease)}`,
      '-c', 'mcp_servers.genos.disabled_tools=["genos_orchestrate"]',
      '-c', 'mcp_servers.genos.startup_timeout_sec=30',
      '-c', 'mcp_servers.genos.tool_timeout_sec=120'
    );
  }
  args.push('-C', workspace, '-');
  const child = spawn(codexCommand, args, {
    cwd: workspace,
    env: {
      ...process.env,
      CODEX_HOME: isolatedCodexHome,
      GENOS_EXECUTION_MODE: executionMode,
      GENOS_AGENT_ID: mission.agentId,
      GENOS_ORCHESTRATOR_AGENT_ID: orchestratorAgentId,
      GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(allowedCommands),
      GENOS_ALLOW_FILE_EDITS: allowFileEdits ? 'true' : 'false',
      GENOS_SILENT_UPDATES: executionPolicy.silentUpdates === true ? 'true' : 'false'
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  let buffer = '';
  let stderr = '';
  let finalReportText = '';
  const recordedTurns = [];
  let cleanedUp = false;
  let budgetStopped = null;
  let eventCount = 0;
  let estimatedTokens = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4);
  let exactTokens = 0;
  let observedCostUsd = 0;
  const budgetLimit = (key) => {
    const value = Number(executionBudget[key]);
    return Number.isFinite(value) && value > 0 ? value : Infinity;
  };
  let latencyTimer = null;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (latencyTimer) clearTimeout(latencyTimer);
    fs.rmSync(isolatedCodexHome, { recursive: true, force: true });
  };
  // The plan exposes every relevant GenOS primitive, but a low-risk mission
  // must not invoke all of them merely to satisfy telemetry. Only a future
  // explicitly-declared mandatory set is a completion invariant.
  const requiredTools = new Set(isWorker ? [] : (autonomyPlan.mandatoryTools || []));
  const observedTools = new Set();
  const observeGenosTools = (value) => {
    const text = JSON.stringify(value || {});
    for (const tool of requiredTools) {
      const suffix = tool.replace(/^genos_/, '');
      if (text.includes(tool) || text.includes(`__${suffix}`) || text.includes(`\"${suffix}\"`)) observedTools.add(tool);
    }
  };
  const emit = (event) => process.stdout.write(encodeEvent({ ...event, payloadJson: JSON.stringify(event.payload || {}) }));
  const stopForBudget = (dimension, observed, limit) => {
    if (budgetStopped) return;
    budgetStopped = { dimension, observed, limit };
    emit({
      eventType: 'BUDGET_EXHAUSTED', action: 'BUDGET_GUARD',
      detail: `${dimension} budget exhausted during execution (${observed} > ${limit}).`,
      severity: 'warning', status: 'blocked', currentTask: 'Execution stopped by budget guard',
      payload: budgetStopped
    });
    try { child.stdout.pause(); } catch (_) {}
    try { child.stderr.pause(); } catch (_) {}
    setImmediate(() => {
      try {
        terminateChild(child);
      } catch (_) {
        try { child.kill('SIGTERM'); } catch (_) {}
      }
    });
  };
  const accountEvent = (event, rawLine) => {
    eventCount += 1;
    const usage = event.usage || event.payload?.usage || {};
    const reportedTokens = Number(usage.total_tokens || (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0)) || 0);
    if (reportedTokens > 0) {
      exactTokens = Math.max(exactTokens, reportedTokens);
    } else if (event.type === 'agent_message' || event.item?.type === 'agent_message') {
      const messageText = String(event.item?.text || event.text || '');
      estimatedTokens += Math.ceil(Buffer.byteLength(messageText, 'utf8') / 4);
    }
    observedCostUsd += Number(event.cost_usd || usage.cost_usd || 0);
    const observedTokens = exactTokens || estimatedTokens;
    if (observedTokens > budgetLimit('tokens')) stopForBudget('tokens', observedTokens, budgetLimit('tokens'));
    else if (eventCount > budgetLimit('events')) stopForBudget('events', eventCount, budgetLimit('events'));
    else if (observedCostUsd > budgetLimit('costUsd')) stopForBudget('costUsd', observedCostUsd, budgetLimit('costUsd'));
  };
  emit({ eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Codex implementation runtime accepted the mission.', status: 'running', currentTask: mission.prompt });
  strategyAdapter.executePipelineWithFeedback(
    ['search_memory', 'compile_memory'],
    { agentId: mission.agentId, orchestratorId: orchestratorAgentId, task: mission.prompt }
  ).then((res) => {
    if (res && res.results && res.results.length) {
      emit({ eventType: 'AGENT_STEP', action: 'MEMORY_RETRIEVAL', detail: 'Strategy memory retrieval primitives executed.', payload: { results: res.results } });
    }
  }).catch(() => {});
  const latencyLimit = budgetLimit('latencyMs');
  if (Number.isFinite(latencyLimit)) {
    latencyTimer = setTimeout(() => stopForBudget('latencyMs', latencyLimit + 1, latencyLimit), latencyLimit);
  }
  if (estimatedTokens > budgetLimit('tokens')) {
    setImmediate(() => stopForBudget('tokens', estimatedTokens, budgetLimit('tokens')));
  }

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    if (Buffer.byteLength(buffer, 'utf8') > MAX_RUNTIME_LINE_BYTES) {
      stopForBudget('outputBytes', Buffer.byteLength(buffer, 'utf8'), MAX_RUNTIME_LINE_BYTES);
      buffer = '';
      return;
    }
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.filter(Boolean).forEach((line) => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      accountEvent(event, line);
      if (budgetStopped) return;
      observeGenosTools(event);
      const type = String(event.type || '');
      if (type === 'turn.started') emit({ eventType: 'AGENT_STEP', action: 'THINK', detail: 'Implementation turn started.', payload: event });
      else if (type === 'item.started') emit({ eventType: 'AGENT_STEP', action: event.item?.type || 'EXECUTE', detail: event.item?.command || event.item?.text || 'Execution item started.', payload: event });
      else if (type === 'item.completed') {
        let ch = null;
        if (event.item?.type === 'agent_message' && typeof event.item?.text === 'string') {
          const c = immune.chaperoneAgentOutput(event.item.text, { prompt: mission.prompt });
          finalReportText = c.purifiedText || event.item.text;
          ch = c.health;
          if (c.warning) emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive observée dans le message agent.', severity: 'warning', payload: c.health });
        }
        const hasError = Boolean(event.error || event.item?.error || (event.item?.exit_code !== undefined && event.item?.exit_code !== 0));
        recordedTurns.push({ step: recordedTurns.length + 1, type: event.item?.type || 'action', action: event.item?.command || event.item?.type || 'action', cmd: event.item?.command || null, pass: !hasError, detail: String(event.item?.command || event.item?.text || '').slice(0, 300) });
        emit({ eventType: 'AGENT_STEP', action: event.item?.type || 'EXECUTE', detail: event.item?.command || event.item?.text || 'Execution item completed.', payload: event });

        const errorsInLoop = recordedTurns.slice(-5).filter(t => !t.pass).length;
        const progressScore = event.item?.type === 'agent_message' ? 1.0 : (hasError ? 0.0 : 0.2);
        const evalResult = agentConscience.evaluateBranch(conscienceState, {
          errorsInLoop,
          progressScore,
          cognitiveHealth: ch || {}
        });
        if (evalResult.apoptoticTriggered) {
          emit({
            eventType: 'AGENT_HALTED', action: 'CELLULAR_APOPTOSIS',
            detail: `Cognitive apoptosis triggered (dissonance: ${conscienceState.dissonanceLevel.toFixed(1)}, budget: ${conscienceState.currentBudget.toFixed(0)}).`,
            severity: 'error', status: 'blocked', currentTask: 'Cellular apoptosis triggered',
            payload: { conscienceState }
          });
          terminateChild(child);
        }
        if (db && hasAgentInDb) {
          pendingConscienceOp = pendingConscienceOp
            .then(() => agentConscience.persistConscienceState(db, mission.agentId, conscienceState, { reason: 'item_completed' }))
            .catch(() => {});
        }
      }
      else if (type === 'turn.completed') {
        const drift = finalReportText ? immune.evaluateCognitiveDrift(finalReportText) : null;
        if (drift?.warning) emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive ou répétition excessive observée.', severity: 'warning', payload: drift });
        emit({ eventType: 'AGENT_STEP', action: 'VERIFY', detail: 'Implementation turn completed.', payload: event });
        if (db && hasAgentInDb) {
          pendingConscienceOp = pendingConscienceOp
            .then(() => agentConscience.persistConscienceState(db, mission.agentId, conscienceState, { reason: 'turn_completed' }))
            .catch(() => {});
        }
      }
    });
  });
  child.stderr.on('data', (chunk) => {
    const detail = chunk.toString();
    stderr = `${stderr}${detail}`.slice(-4000);
    process.stderr.write(detail);
  });
  // Use stdin for the prompt. This prevents mission text beginning with a dash
  // (or exceeding the platform's argv limit) from being interpreted as CLI args.
  child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') process.stderr.write(`Runtime stdin error: ${error.message}\n`);
  });
  child.stdin.end(prompt);
  child.on('error', (error) => {
    emit({ eventType: 'AGENT_RUNTIME_ERROR', action: 'ERROR', detail: error.message, severity: 'error', status: 'error' });
    process.exitCode = 1;
    cleanup();
    process.exit(1);
  });
  child.on('close', (code, signal) => {
    return handleRuntimeClose({
      code, signal, budgetStopped, emit, cleanup, requiredTools, observedTools,
      db, hasAgentInDb, agentConscience, conscienceState, pendingConscienceOp,
      mission, finalReportText, agentName, nameMeaning, autonomyPlan, isWorker,
      exactTokens, estimatedTokens, eventCount, observedCostUsd, strategyContract,
      orchestratorAgentId, recordedTurns, stderr
    });
  });
});