#!/usr/bin/env node
/**
 * GenOS mission runtime bridge.
 * Reads one framed protobuf (or legacy JSON) mission from stdin, delegates the implementation to Codex CLI,
 * and emits one normalized NDJSON event per meaningful Codex lifecycle event.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');

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
  let strategyContract = {};
  try { strategyContract = JSON.parse(mission.strategyContractJson || '{}'); } catch {}
  let autonomyPlan = {};
  try { autonomyPlan = JSON.parse(mission.autonomyPlanJson || '{}'); } catch {}
  const isWorker = mission.executionMode === 'worker';
  const authorityInstruction = isWorker
    ? `You are a GenOS worker dispatched by orchestrator ${mission.orchestratorAgentId}. Execute only this assigned mission. Do not select a new strategy contract, spawn peer agents, or promote a result; return evidence to the orchestrator.`
    : 'You are the GenOS orchestrator. You own strategy selection, task decomposition, worker dispatch, evaluation, replay, and promotion. The control plane evaluated the complete 77-strategy registry before producing this contract; use the selected portfolio rather than treating every strategy as mandatory. You hold the decision authority in the autonomous plan: at every decision gate, assess your evidence and worker evidence, choose the smallest safe action, invoke its GenOS MCP tool, and record the reason. Do not follow a fixed branch count: create, stop, fork, replay, merge, or re-organize GenOS workers only when the gate conditions and token policy justify it. Before a risky mutation, retrieve negative knowledge or diagnose, snapshot/fork when comparing alternatives, evaluate evidence, and record the decision. Change the organization only on evidence, keep parasite/adversarial branches isolated, and stop or reallocate branches using the token policy.';
  const prompt = [
    `You are a GenOS implementation agent (${mission.name || mission.agentId}).`,
    `Agent role: ${mission.role || 'Autonomous implementation agent'}.`,
    authorityInstruction,
    'Work directly in the assigned repository and implement the mission completely.',
    'Keep changes scoped to the repository, inspect existing code before editing, run relevant tests, and report concrete progress.',
    strategyContract.selected_strategy?.primary
      ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(strategyContract, null, 2)}`
      : 'No explicit strategy contract was attached; use the safest verified execution path.',
    !isWorker && autonomyPlan.schema
      ? `Autonomous orchestration plan (required tools/phases; do not claim completion until its replay-and-promote phase has been attempted):\n${JSON.stringify(autonomyPlan, null, 2)}`
      : '',
    `Mission:\n${mission.prompt || mission.currentTask || 'Inspect the repository and report the next safe action.'}`
  ].join('\n\n');
  const codex = process.env.CODEX_EXECUTABLE || 'codex';
  const args = ['exec', '--json', '--ephemeral'];
  if (fs.existsSync(mcpBinary) && fs.existsSync(genosBinary)) {
    args.push(
      '-c', `mcp_servers.genos.command=${JSON.stringify(mcpBinary)}`,
      '-c', 'mcp_servers.genos.args=["stdio"]',
      '-c', `mcp_servers.genos.cwd=${JSON.stringify(workspace)}`,
      '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(workspace)},GENOS_BIN=${JSON.stringify(genosBinary)},GENOS_MCP_EXPOSE_ALL="true"}`,
      '-c', 'mcp_servers.genos.startup_timeout_sec=30',
      '-c', 'mcp_servers.genos.tool_timeout_sec=120'
    );
  }
  if (/^(1|true)$/i.test(String(process.env.GENOS_CODEX_UNSAFE_BYPASS || ''))) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }
  args.push('-C', workspace, '-');
  const child = spawn(codex, args, { cwd: workspace, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let stderr = '';
  const requiredTools = new Set(isWorker ? [] : (autonomyPlan.requiredTools || []));
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
      else if (type === 'item.completed') emit({ eventType: 'AGENT_STEP', action: event.item?.type || 'EXECUTE', detail: event.item?.command || event.item?.text || 'Execution item completed.', payload: event });
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
  });
  child.on('close', (code, signal) => {
    const missingTools = [...requiredTools].filter((tool) => !observedTools.has(tool));
    if (code === 0 && missingTools.length) {
      emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'ORCHESTRATION_POLICY', detail: `Required GenOS orchestration tools were not observed: ${missingTools.join(', ')}.`, severity: 'error', status: 'error', payload: { missingTools, observedTools: [...observedTools] } });
      process.exitCode = 1;
    } else if (code === 0) emit({ eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Codex implementation runtime completed.', status: 'idle', currentTask: 'Execution completed', payload: { code, observedTools: [...observedTools] } });
    else emit({ eventType: 'AGENT_FAILED', action: 'ERROR', detail: `Codex runtime exited with code ${code ?? 'unknown'}${stderr.trim() ? `: ${stderr.trim()}` : '.'}`, severity: 'error', status: 'error', payload: { code, signal, stderr: stderr.trim() } });
    if (process.exitCode === undefined) process.exitCode = code || 0;
  });
});
