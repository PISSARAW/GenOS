#!/usr/bin/env node
/**
 * GenOS mission runtime bridge.
 * Reads one framed protobuf (or legacy JSON) mission from stdin, delegates the implementation to Codex CLI,
 * and emits one normalized NDJSON event per meaningful Codex lifecycle event.
 */
const { spawn } = require('child_process');
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
  let strategyContract = {};
  try { strategyContract = JSON.parse(mission.strategyContractJson || '{}'); } catch {}
  const prompt = [
    `You are a GenOS implementation agent (${mission.name || mission.agentId}).`,
    `Agent role: ${mission.role || 'Autonomous implementation agent'}.`,
    'Work directly in the assigned repository and implement the mission completely.',
    'Keep changes scoped to the repository, inspect existing code before editing, run relevant tests, and report concrete progress.',
    strategyContract.selected_strategy?.primary
      ? `Follow this auditable GenOS strategy contract. Primary strategy: ${strategyContract.selected_strategy.primary}.\nContract:\n${JSON.stringify(strategyContract, null, 2)}`
      : 'No explicit strategy contract was attached; use the safest verified execution path.',
    `Mission:\n${mission.prompt || mission.currentTask || 'Inspect the repository and report the next safe action.'}`
  ].join('\n\n');
  const codex = process.env.CODEX_EXECUTABLE || 'codex';
  const args = [
    'exec', '--json', '--ephemeral', '--dangerously-bypass-approvals-and-sandbox',
    '-C', workspace, '-'
  ];
  const child = spawn(codex, args, { cwd: workspace, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let stderr = '';
  const emit = (event) => process.stdout.write(encodeEvent({ ...event, payloadJson: JSON.stringify(event.payload || {}) }));
  emit({ eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Codex implementation runtime accepted the mission.', status: 'running', currentTask: mission.prompt });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.filter(Boolean).forEach((line) => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
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
    if (code === 0) emit({ eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Codex implementation runtime completed.', status: 'idle', currentTask: 'Execution completed', payload: { code } });
    else emit({ eventType: 'AGENT_FAILED', action: 'ERROR', detail: `Codex runtime exited with code ${code ?? 'unknown'}${stderr.trim() ? `: ${stderr.trim()}` : '.'}`, severity: 'error', status: 'error', payload: { code, signal, stderr: stderr.trim() } });
    process.exitCode = code || 0;
  });
});
