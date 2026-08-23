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
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');

function compactStrategyContract(contract = {}) {
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
  return {
    schema: plan.schema,
    profile: plan.profile,
    organization: plan.organization,
    phases: (plan.phases || []).map(({ key, requiredTools, purpose }) => ({ key, requiredTools, purpose })),
    requiredTools: plan.requiredTools,
    dispatchWorkers: (plan.dispatchWorkers || []).map(({ label, hypothesis, role, modelTier }) => ({ label, hypothesis, role, modelTier })),
    competition: plan.competition,
    evolution: plan.evolution,
    parasitism: plan.parasitism,
    aTeam: plan.aTeam,
    tokenPolicy: plan.tokenPolicy
  };
}

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', () => {
  let mission;
  try { mission = decodeMissionInput(raw); } catch (error) {
    process.stderr.write(`Invalid mission payload (protobuf frame or JSON object): ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  // Resolve the repository relative to this bridge rather than the caller's cwd.
  // The backend can be started from either `backend/` or the repository root.
  const workspace = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../..');
  const genosBinary = process.env.GENOS_BIN || path.resolve(__dirname, '../../target/debug/genos');
  const mcpBinary = process.env.GENOS_MCP_BIN || path.resolve(__dirname, '../../target/debug/genos-mcp');
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
  const allowedCommands = Array.isArray(executionPolicy.allowedCommands)
    ? [...new Set(executionPolicy.allowedCommands.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  const allowFileEdits = executionPolicy.allowFileEdits === true;
  const isWorker = mission.executionMode === 'worker';
  const executionMode = isWorker ? 'worker' : 'orchestrator';
  const orchestratorAgentId = mission.orchestratorAgentId || mission.agentId || '';
  const authorityInstruction = isWorker
    ? `You are a GenOS worker dispatched by orchestrator ${mission.orchestratorAgentId}. Execute only this assigned mission. Do not select a new strategy contract, spawn peer agents, or promote a result; return evidence to the orchestrator.`
    : 'You are the GenOS orchestrator. You own strategy selection, task decomposition, worker dispatch, evaluation, replay, and promotion. The control plane evaluated the complete 77-strategy registry before producing this contract; use the selected portfolio rather than treating every strategy as mandatory. You hold the decision authority in the autonomous plan: at every decision gate, assess your evidence and worker evidence, choose the smallest safe action, invoke its GenOS MCP tool, and record the reason. When a mission genuinely requires at least two distinct competency domains, use the control-plane A-Team already composed in the plan; if none was composed, the token policy still permits it, and two or more specialists are necessary, call genos_a_team_preview once with two or three bounded subsystems and matching roles. Do not create an A-Team for a single-domain task, exceed the token policy, or duplicate members already running. Before a risky mutation, retrieve negative knowledge or diagnose, snapshot/fork when comparing alternatives, evaluate evidence, and record the decision. Change the organization only on evidence, keep parasite/adversarial branches isolated, and stop or reallocate branches using the token policy.';
  const runtimeContract = compactStrategyContract(strategyContract);
  const runtimeAutonomyPlan = compactAutonomyPlan(autonomyPlan);
  const prompt = [
    `You are a GenOS implementation agent (${mission.name || mission.agentId}).`,
    `Agent role: ${mission.role || 'Autonomous implementation agent'}.`,
    authorityInstruction,
    'Work directly in the assigned repository and implement the mission completely.',
    'Keep changes scoped to the repository, inspect existing code before editing, run relevant tests, and report concrete progress. Your final response must be a single JSON object with this schema: {"claims":[{"statement":"specific conclusion","evidence":["test output, receipt, or inspected artifact"]}],"uncertainties":["anything not verified"],"tests":["command and result"]}. Do not state a conclusion as fact without at least one evidence entry; use uncertainties instead.',
    strategyContract.selected_strategy?.primary
      ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(runtimeContract, null, 2)}`
      : 'No explicit strategy contract was attached; use the safest verified execution path.',
    !isWorker && autonomyPlan.schema
      ? `Autonomous orchestration plan. Its phases and tools are decision gates, not a mandatory script: choose and invoke only the smallest safe tools justified by current evidence. Record every elected action and preserve replay/merge evidence before promotion:\n${JSON.stringify(runtimeAutonomyPlan, null, 2)}`
      : '',
    !isWorker && autonomyPlan.parasitism?.enabled
      ? 'Parasitic pressure is enabled for this risk profile. If—and only if—you can construct a schema-valid parasite/agent genome manifest inside an isolated capsule, run genos_parasitic_pressure there with evolution enabled; keep its report as evidence and never merge it automatically.'
      : '',
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
  if (fs.existsSync(mcpBinary) && fs.existsSync(genosBinary)) {
    args.push(
      '-c', `mcp_servers.genos.command=${JSON.stringify(mcpBinary)}`,
      '-c', 'mcp_servers.genos.args=["stdio"]',
      '-c', `mcp_servers.genos.cwd=${JSON.stringify(workspace)}`,
      '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(workspace)},GENOS_BIN=${JSON.stringify(genosBinary)},GENOS_MCP_EXPOSE_ALL="true",GENOS_ORCHESTRATOR_BRIDGE=${JSON.stringify(orchestratorBridge)},GENOS_EXECUTION_MODE=${JSON.stringify(executionMode)},GENOS_ORCHESTRATOR_AGENT_ID=${JSON.stringify(orchestratorAgentId)},GENOS_ALLOWED_COMMANDS_JSON=${JSON.stringify(JSON.stringify(allowedCommands))},GENOS_ALLOW_FILE_EDITS=${JSON.stringify(allowFileEdits ? 'true' : 'false')}${toolLease.length ? `,GENOS_MCP_LEASE=${JSON.stringify(toolLease.join(','))}` : ''}}`,
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
      GENOS_ORCHESTRATOR_AGENT_ID: orchestratorAgentId,
      GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(allowedCommands),
      GENOS_ALLOW_FILE_EDITS: allowFileEdits ? 'true' : 'false'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let buffer = '';
  let stderr = '';
  let finalReportText = '';
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
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
  emit({ eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Codex implementation runtime accepted the mission.', status: 'running', currentTask: mission.prompt });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.filter(Boolean).forEach((line) => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      observeGenosTools(event);
      const type = String(event.type || '');
      if (type === 'turn.started') emit({ eventType: 'AGENT_STEP', action: 'THINK', detail: 'Implementation turn started.', payload: event });
      else if (type === 'item.started') emit({ eventType: 'AGENT_STEP', action: event.item?.type || 'EXECUTE', detail: event.item?.command || event.item?.text || 'Execution item started.', payload: event });
      else if (type === 'item.completed') {
        if (event.item?.type === 'agent_message' && typeof event.item?.text === 'string') finalReportText = event.item.text;
        emit({ eventType: 'AGENT_STEP', action: event.item?.type || 'EXECUTE', detail: event.item?.command || event.item?.text || 'Execution item completed.', payload: event });
      }
      else if (type === 'turn.completed') emit({ eventType: 'AGENT_STEP', action: 'VERIFY', detail: 'Implementation turn completed.', payload: event });
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
  });
  child.on('close', (code, signal) => {
    const missingTools = [...requiredTools].filter((tool) => !observedTools.has(tool));
    if (code === 0 && missingTools.length) {
      emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'ORCHESTRATION_POLICY', detail: `Required GenOS orchestration tools were not observed: ${missingTools.join(', ')}.`, severity: 'error', status: 'error', payload: { missingTools, observedTools: [...observedTools] } });
      process.exitCode = 1;
    } else if (code === 0) {
      let report;
      try {
        const json = finalReportText.match(/\{[\s\S]*\}/)?.[0];
        report = JSON.parse(json || '');
        if (!Array.isArray(report.claims)) throw new Error('claims must be an array');
      } catch (_) {
        report = { claims: [], unverifiedClaims: ['The agent completed without a valid evidence report.'] };
      }
      emit({ eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS', detail: 'Validated the agent final evidence report.', payload: report });
      emit({ eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Codex implementation runtime completed.', status: 'idle', currentTask: 'Execution completed', payload: { code, observedTools: [...observedTools], evidenceReport: report } });
    }
    else emit({ eventType: 'AGENT_FAILED', action: 'ERROR', detail: `Codex runtime exited with code ${code ?? 'unknown'}${stderr.trim() ? `: ${stderr.trim()}` : '.'}`, severity: 'error', status: 'error', payload: { code, signal, stderr: stderr.trim() } });
    if (process.exitCode === undefined) process.exitCode = code || 0;
    cleanup();
  });
});
