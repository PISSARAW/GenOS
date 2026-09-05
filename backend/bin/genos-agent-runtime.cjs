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
const immune = require('../src/services/immuneSystem');

function compactStrategyContract(contract = {}, worker = false) {
  if (worker) {
    return {
      schema: contract.schema,
      selected_strategy: contract.selected_strategy,
      stop_conditions: contract.stop_conditions,
      promotion: contract.promotion
    };
  }
  return {
    schema: contract.schema,
    mission: contract.mission,
    problem_profile: contract.problem_profile,
    selected_strategy: contract.selected_strategy,
    strategy_portfolio: (contract.strategy_portfolio || []).map(({ id, role, primitives, score }) => ({ id, role, primitives, score })),
    execution_pipeline: contract.execution_pipeline,
    branches: (contract.branches || []).slice(0, 3),
    stop_conditions: contract.stop_conditions,
    promotion: contract.promotion
  };
}

function compactAutonomyPlan(plan = {}) {
  if (plan.synthesisOnly === true) {
    return {
      schema: plan.schema,
      synthesisOnly: true,
      completedWorkerIds: plan.completedWorkerIds || [],
      dossierInfluenceRequired: true,
      tokenPolicy: plan.tokenPolicy
    };
  }
  return {
    schema: plan.schema,
    synthesisOnly: plan.synthesisOnly === true,
    completedWorkerIds: plan.completedWorkerIds || [],
    profile: plan.profile,
    organization: plan.organization,
    organizationPolicy: plan.organizationPolicy,
    phases: (plan.phases || []).map(({ key, requiredTools, purpose }) => ({ key, requiredTools, purpose })),
    requiredTools: plan.requiredTools,
    dispatchWorkers: (plan.dispatchWorkers || []).map(({ label, hypothesis, role, modelTier }) => ({ label, hypothesis, role, modelTier })),
    competition: plan.competition,
    evolution: plan.evolution,
    parasitism: plan.parasitism,
    aTeam: plan.aTeam,
    trinity: plan.trinity,
    localModelReview: plan.localModelReview?.consulted ? {
      consulted: true,
      selectedModel: plan.localModelReview.selectedModel,
      provider: plan.localModelReview.provider,
      advice: String(plan.localModelReview.advice || '').slice(0, 4000),
      route: plan.localModelReview.route
    } : { consulted: false, error: plan.localModelReview?.error || null },
    tokenPolicy: plan.tokenPolicy
  };
}

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
  const resolveBin = (p) => fs.existsSync(p) ? p : (fs.existsSync(`${p}.exe`) ? `${p}.exe` : p);
  const genosBinary = resolveBin(process.env.GENOS_BIN || path.resolve(__dirname, '../../target/debug/genos'));
  const mcpBinary = resolveBin(process.env.GENOS_MCP_BIN || path.resolve(__dirname, '../../target/debug/genos-mcp'));
  const orchestratorBridge = process.env.GENOS_ORCHESTRATOR_BRIDGE || path.resolve(__dirname, 'genos-orchestrate.cjs');
  let strategyContract = {};
  try { strategyContract = JSON.parse(mission.strategyContractJson || '{}'); } catch {}
  let autonomyPlan = {};
  try { autonomyPlan = JSON.parse(mission.autonomyPlanJson || '{}'); } catch {}
  let toolLease = [];
  try { toolLease = JSON.parse(mission.toolLeaseJson || '[]'); } catch {}
  let genosCapsule = {};
  try { genosCapsule = JSON.parse(mission.genosCapsuleJson || '{}'); } catch {}
  let executionPolicy = {};
  try { executionPolicy = JSON.parse(mission.executionPolicyJson || '{}'); } catch {}
  let executionBudget = {};
  try { executionBudget = JSON.parse(mission.executionBudgetJson || '{}'); } catch {}
  const allowedCommands = Array.isArray(executionPolicy.allowedCommands)
    ? [...new Set(executionPolicy.allowedCommands.map((value) => String(value).trim()).filter(Boolean))]
    : [];
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
  const conscienceState = agentConscience.createConscienceState();
  const conscienceBlock = agentConscience.formatConsciencePrompt(conscienceState);

  let memoryBlock = '';
  try {
    memoryBlock = await agentMemory.formatCognitiveMemoryPrompt(agentName, mission.prompt || mission.currentTask);
  } catch (_) {}

  const prompt = [
    `${selfIntro}`,
    `Agent role: ${mission.role || 'Autonomous implementation agent'}.`,
    `${conscienceBlock}`,
    memoryBlock ? `${memoryBlock}` : '',
    authorityInstruction,
    'Work directly in the assigned repository and implement the mission completely.',
    `Keep changes scoped to the repository, inspect existing code before editing, run relevant tests, and report concrete progress. Your final response must be a single JSON object with this schema: {"author":{"name":"${agentName}","meaning":"${nameMeaning}"},"outcome":"success|failed|no_answer","claims":[{"statement":"specific conclusion","evidence":["test output, receipt, or inspected artifact"]}],"uncertainties":["anything not verified"],"tests":["command and result"],"dossierInfluence":[{"workerId":"delegated worker id","usedClaims":["claim used or rejected"],"influence":"how this dossier changed or constrained the synthesis"}],"artifact":"creative when applicable","artifactText":"creative work when applicable","creativeEvaluation":{"rubric":{"craft":0,"coherence":0,"originality":0,"emotionalImpact":0,"constraintCoverage":0},"constraintCoverage":0,"revisions":[],"criticEvidence":[]},"failure":{"category":"unresolved_task|falsified_hypothesis|capability_mismatch|transient_runtime","reason":"why the mission failed","evidence":["concrete observations"]},"noAnswerProof":{"method":"bounded exhaustive method","evidence":["proof artifacts"]}}. If you cannot complete the mission, set outcome=failed and explain it explicitly; do not hide failure behind a successful process exit. Set outcome=no_answer only with concrete proof that no answer exists in the stated scope. Do not state a conclusion as fact without at least one evidence entry; use uncertainties instead.`,
    strategyContract.selected_strategy?.primary
      ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(runtimeContract, null, 2)}\n\nExecutable Strategy Primitives: The 7 lots of GenOS primitives are executable via MCP tools (e.g. genos_strat_mcts_select, genos_strat_compile_memory, genos_strat_mutate, genos_strat_stdp_update, genos_strat_evaluate, genos_strat_bisect_agent, genos_strat_vfs_dry_run) or genos_execute_primitive. Invoke them at appropriate stages of the mission.`
      : 'No explicit strategy contract was attached; use the safest verified execution path.',
    !isWorker && autonomyPlan.schema
      ? `Autonomous orchestration plan. Its phases and tools are decision gates, not a mandatory script: choose and invoke only the smallest safe tools justified by current evidence. Record every elected action and preserve replay/merge evidence before promotion:\n${JSON.stringify(runtimeAutonomyPlan, null, 2)}`
      : '',
    !isWorker && runtimeAutonomyPlan.localModelReview?.consulted
      ? 'The local-model review above is advisory evidence. Explicitly compare it with the strategy contract before dispatching, replaying, merging, or rejecting its recommendations; mention the accepted or rejected recommendations in your final evidence report.'
      : '',
    !isWorker && autonomyPlan.parasitism?.enabled
      ? 'Parasitic pressure is enabled for this risk profile. If—and only if—you can construct a schema-valid parasite/agent genome manifest inside an isolated capsule, run genos_parasitic_pressure there with evolution enabled; keep its report as evidence and never merge it automatically.'
      : '',
    !isWorker && executionPolicy.silentUpdates !== true
      ? 'Keep the user informed through genos_report_progress at meaningful milestones: when the active approach changes, a substantial unit finishes, a blocker appears, or the team enters final verification. Report concise outcomes and next steps, not internal chain-of-thought or every tool call.'
      : !isWorker ? 'The user explicitly requested silent execution. Do not call genos_report_progress; return only the final mission result.' : '',
    isWorker && toolLease.length ? `Your enforceable GenOS MCP lease is limited to: ${toolLease.join(', ')}.` : '',
    genosCapsule.id
      ? `Your active GenOS capsule is ${genosCapsule.id}. For capsule tools, pass capsule_id=${genosCapsule.id} and root=${genosCapsule.root}. This capsule was created by the control plane; do not invent or replace its identity.`
      : '',
    `Execution policy: file edits are ${allowFileEdits ? 'allowed inside this capsule' : 'not allowed'}; the only authorized shell commands are ${allowedCommands.length ? allowedCommands.map((command) => JSON.stringify(command)).join(', ') : 'none'}. Do not attempt any other shell command, including discovery or Git commands.`,
    `Mission:\n${mission.prompt || mission.currentTask || 'Inspect the repository and report the next safe action.'}`
  ].join('\n\n');
  const codex = process.env.CODEX_EXECUTABLE || 'codex';
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
  const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--dangerously-bypass-hook-trust', '-c', 'approval_policy="never"'];
  args.push(...codexRuntimeConfiguration.commandOptions(mission));
  const mcpNodeScript = path.resolve(__dirname, '../../mcp/index.js');
  const mcpCommand = fs.existsSync(mcpBinary) ? mcpBinary : (fs.existsSync(mcpNodeScript) ? process.execPath : null);
  const mcpArgs = mcpCommand === mcpBinary ? ['stdio'] : [mcpNodeScript];
  if (mcpCommand) {
    args.push(
      '-c', `mcp_servers.genos.command=${JSON.stringify(mcpCommand)}`,
      '-c', `mcp_servers.genos.args=${JSON.stringify(mcpArgs)}`,
      '-c', `mcp_servers.genos.cwd=${JSON.stringify(workspace)}`,
      '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(workspace)},GENOS_BIN=${JSON.stringify(genosBinary)},GENOS_MCP_EXPOSE_ALL="true",GENOS_ORCHESTRATOR_BRIDGE=${JSON.stringify(orchestratorBridge)},GENOS_EXECUTION_MODE=${JSON.stringify(executionMode)},GENOS_AGENT_ID=${JSON.stringify(mission.agentId)},GENOS_ORCHESTRATOR_AGENT_ID=${JSON.stringify(orchestratorAgentId)},GENOS_ALLOWED_COMMANDS_JSON=${JSON.stringify(JSON.stringify(allowedCommands))},GENOS_ALLOW_FILE_EDITS=${JSON.stringify(allowFileEdits ? 'true' : 'false')},GENOS_SILENT_UPDATES=${JSON.stringify(executionPolicy.silentUpdates === true ? 'true' : 'false')}${toolLease.length ? `,GENOS_MCP_LEASE=${JSON.stringify(toolLease.join(','))}` : ''}}`,
      '-c', `mcp_servers.genos.enabled_tools=${JSON.stringify(toolLease)}`,
      '-c', 'mcp_servers.genos.disabled_tools=["genos_orchestrate"]',
      '-c', 'mcp_servers.genos.startup_timeout_sec=30',
      '-c', 'mcp_servers.genos.tool_timeout_sec=120'
    );
  }
  if (/^(1|true)$/i.test(String(process.env.GENOS_CODEX_UNSAFE_BYPASS || ''))) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }
  args.push('-C', workspace, '-');
  const child = spawn(codex, args, {
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
    stdio: ['pipe', 'pipe', 'pipe']
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
    child.kill('SIGTERM');
  };
  const accountEvent = (event, rawLine) => {
    eventCount += 1;
    estimatedTokens += Math.ceil(Buffer.byteLength(rawLine || '', 'utf8') / 4);
    const usage = event.usage || event.payload?.usage || {};
    const reportedTokens = Number(usage.total_tokens || (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0)) || 0);
    if (reportedTokens > 0) exactTokens = Math.max(exactTokens, reportedTokens);
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
        if (event.item?.type === 'agent_message' && typeof event.item?.text === 'string') {
          const c = immune.chaperoneAgentOutput(event.item.text, { prompt: mission.prompt });
          finalReportText = c.purifiedText || event.item.text;
          if (c.warning) emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive observée dans le message agent.', severity: 'warning', payload: c.health });
        }
        recordedTurns.push({ step: recordedTurns.length + 1, type: event.item?.type || 'action', action: event.item?.command || event.item?.type || 'action', cmd: event.item?.command || null, pass: !event.error, detail: String(event.item?.command || event.item?.text || '').slice(0, 300) });
        emit({ eventType: 'AGENT_STEP', action: event.item?.type || 'EXECUTE', detail: event.item?.command || event.item?.text || 'Execution item completed.', payload: event });
      }
      else if (type === 'turn.completed') {
        const drift = finalReportText ? immune.evaluateCognitiveDrift(finalReportText) : null;
        if (drift?.warning) emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive ou répétition excessive observée.', severity: 'warning', payload: drift });
        emit({ eventType: 'AGENT_STEP', action: 'VERIFY', detail: 'Implementation turn completed.', payload: event });
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
    const missingTools = [...requiredTools].filter((tool) => !observedTools.has(tool));
    if (budgetStopped) {
      emit({ eventType: 'AGENT_HALTED', action: 'BUDGET_GUARD', detail: 'Runtime stopped at the active execution budget boundary.', severity: 'warning', status: 'blocked', currentTask: 'Budget exhausted', payload: { code, signal, budget: budgetStopped } });
      process.exitCode = 1;
    } else if (code === 0 && missingTools.length) {
      emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'ORCHESTRATION_POLICY', detail: `Required GenOS orchestration tools were not observed: ${missingTools.join(', ')}.`, severity: 'error', status: 'error', payload: { missingTools, observedTools: [...observedTools] } });
      process.exitCode = 1;
    } else if (code === 0) {
      const phagocytosis = immune.phagocytoseCodexReport(finalReportText, { agentName, nameMeaning, role: mission.role });
      let report;
      if (phagocytosis.ok) {
        report = phagocytosis.report;
        if (phagocytosis.repaired) {
          emit({ eventType: 'CHAPERONE_REPAIR_SUCCESS', action: 'HOMEOSTASIS', detail: 'La protéine Chaperon a réparé la syntaxe JSON altérée de Codex.', payload: { heuristic: !!phagocytosis.heuristic } });
        }
      } else {
        report = phagocytosis.fallbackReport;
        emit({ eventType: 'CELLULAR_APOPTOSIS', action: 'APOPTOSIS', detail: 'Échec irrécupérable du formatage de Codex. Apoptose et signal de douleur déclenchés.', severity: 'error', status: 'error', payload: { error: phagocytosis.error, painSignal: phagocytosis.painSignal } });
      }
      report.author = report.author || { name: agentName, meaning: nameMeaning, role: mission.role };
      if (typeof report.artifactText === 'string') report.artifactText = immune.chaperoneAgentOutput(report.artifactText, { prompt: mission.prompt }).purifiedText;
      const expectedDossiers = autonomyPlan.synthesisOnly ? (autonomyPlan.completedWorkerIds || []) : [];
      const influences = new Map((Array.isArray(report.dossierInfluence) ? report.dossierInfluence : [])
        .filter((entry) => entry && typeof entry.workerId === 'string')
        .map((entry) => [entry.workerId, entry]));
      const uninfluential = expectedDossiers.filter((workerId) => {
        const entry = influences.get(workerId);
        return !entry || typeof entry.influence !== 'string' || !entry.influence.trim() || !Array.isArray(entry.usedClaims);
      });
      if (uninfluential.length) {
        emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'DOSSIER_INFLUENCE', detail: `Final synthesis did not account for every worker dossier: ${uninfluential.join(', ')}.`, severity: 'error', status: 'error', payload: { expectedDossiers, uninfluential } });
        process.exitCode = 1;
        cleanup();
        return;
      }
      if (expectedDossiers.length) {
        emit({ eventType: 'DOSSIER_INFLUENCE_VERIFIED', action: 'VERIFY_SYNTHESIS', detail: `Verified explicit influence records for all ${expectedDossiers.length} worker dossiers.`, payload: { workerIds: expectedDossiers } });
      }
      emit({ eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS', detail: 'Validated the agent final evidence report.', payload: report });
      const classified = workerRecovery.classifyFinalReport(report, isWorker);
      if (classified.outcome === 'no_answer') {
        emit({ eventType: 'WORKER_NO_ANSWER_PROVEN', action: 'REPORT_NO_ANSWER', detail: 'Worker returned an evidence-backed proof that no answer exists in the stated scope.', status: 'completed', currentTask: 'No answer proven', payload: { code, observedTools: [...observedTools], evidenceReport: report, noAnswerProof: classified.noAnswerProof } });
      } else if (classified.outcome === 'failed') {
        emit({ eventType: 'WORKER_TASK_FAILED', action: 'REPORT_FAILURE', detail: classified.failure.reason || 'Worker did not complete the assigned task.', severity: 'warning', status: 'error', currentTask: 'Task failed; awaiting orchestrator decision', payload: { code, observedTools: [...observedTools], evidenceReport: report, failure: classified.failure, noAnswerProof: report.noAnswerProof } });
      } else {
        emit({ eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Codex implementation runtime completed.', status: 'completed', currentTask: 'Execution completed', payload: { code, observedTools: [...observedTools], evidenceReport: report } });
        strategyAdapter.executePipelineWithFeedback(
          ['stdp_update', 'cherry_pick_golden_path'],
          { agentId: mission.agentId, orchestratorId: orchestratorAgentId, workspaceId: mission.workspaceId || 'ws-genos-core', task: mission.prompt, report, turns: recordedTurns.length ? recordedTurns : [...observedTools].map(t => ({ action: t, pass: true })), sourceId: mission.agentId, targetId: orchestratorAgentId }
        ).catch(() => {});
        agentMemory.compileExecutionMemory(agentName, mission.prompt, report?.claims?.map(c => c.statement).join('\n') || finalReportText).catch(() => {});
      }
    }
    else emit({ eventType: 'AGENT_FAILED', action: 'ERROR', detail: `Codex runtime exited with code ${code ?? 'unknown'}${stderr.trim() ? `: ${stderr.trim()}` : '.'}`, severity: 'error', status: 'error', payload: { code, signal, stderr: stderr.trim() } });
    if (process.exitCode === undefined) process.exitCode = code || 0;
    cleanup();
    process.exit(process.exitCode || 0);
  });
});