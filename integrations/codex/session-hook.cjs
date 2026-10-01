#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const storage = require('./session-state.cjs');

function context(state) {
  const agent = path.relative(state.workspace, state.agent).replaceAll('\\', '/');
  const snapshot = path.relative(state.workspace, state.snapshot).replaceAll('\\', '/');
  return `GenOS session ${state.session}. Before native tools call genos_snapshot with agent=${JSON.stringify(agent)} and out=${JSON.stringify(snapshot)}. Checkpoint=${Boolean(state.checkpoint)}. After changes run tests, then genos_record_experience with agentId=${state.session}, actionInput and observationOutput describing commands, results and evidence. Persist memory before compaction. Session evidence: ${state.workspace}/.genos-agent-worlds/codex-sessions/${state.session}/session.json`;
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

function observeCheckpoint(input, state) {
  if (!storage.successfulMcp(input.tool_response)) return;
  if (path.resolve(state.workspace, input.tool_input?.out || '') !== state.snapshot) return;
  const snapshot = JSON.parse(fs.readFileSync(state.snapshot, 'utf8'));
  if (snapshot.agent_id !== state.session || !snapshot.snapshot_id) return;
  state.checkpoint = snapshot.snapshot_id;
}

function observe(input, state) {
  const name = input.tool_name || '';
  if (name.endsWith('__genos_snapshot')) observeCheckpoint(input, state);
  const current = storage.fingerprint(state.workspace);
  if (name === 'Bash') observeTest(input, { state, current });
  if (name.endsWith('__genos_record_experience')) observeExperience(input, { state, current });
  state.events.push({ tool: name, turn: input.turn_id, at: new Date().toISOString(), fingerprint: current });
  state.events = state.events.slice(-100);
}

function observeExperience(input, observation) {
  const result = storage.successfulMcp(input.tool_response);
  if (input.tool_input?.agentId !== observation.state.session || !result?.episodeId) return;
  observation.state.experience = observation.current;
  observation.state.episodeId = result.episodeId;
}

function observeTest(input, observation) {
  const command = input.tool_input?.command || '';
  if (!isValidation(command)) return;
  delete observation.state.experience;
  observation.state.validation = { fingerprint: observation.current, command, exit_code: exitCode(input.tool_response) };
}

function isValidation(command) {
  return /^(?:npm(?: --prefix [\w./-]+)? (?:test|run (?:test[\w:-]*|check:code-quality))|cargo test|node [\w./-]*test[\w./-]*\.(?:cjs|mjs|js)|(?:python|py) scripts\/ci\/check_code_quality\.py)(?:\s|$)/.test(command.trim());
}

function exitCode(response) {
  if (Number.isInteger(response?.exit_code)) return response.exit_code;
  if (typeof response !== 'string') return null;
  const match = response.match(/^Process exited with code (-?\d+)$/m);
  return match ? Number(match[1]) : null;
}

function stop(state) {
  const current = storage.fingerprint(state.workspace);
  if (current === state.baseline) return {};
  if (state.validation?.fingerprint !== current || state.validation?.exit_code !== 0) return { decision: 'block', reason: 'GenOS: run an executable test/check with an explicit successful exit code for the current workspace.' };
  if (state.experience !== current) return { decision: 'block', reason: 'GenOS: persist the verified outcome using genos_record_experience before finishing.' };
  state.baseline = current;
  return {};
}

function processEvent(input, place) {
  const state = storage.load(place);
  const event = input.hook_event_name;
  let output = {};
  if (event === 'PreToolUse' && /^(Bash|apply_patch)$/.test(input.tool_name) && !state.checkpoint) output = deny(context(state));
  if (event === 'PostToolUse') observe(input, state);
  if (event === 'Stop') output = stop(state);
  if (['SessionStart', 'PreCompact', 'PostCompact'].includes(event)) output = { hookSpecificOutput: { hookEventName: event, additionalContext: context(state) } };
  storage.save(place, state);
  return output;
}

function handle(input) {
  const place = storage.location(input);
  const lock = path.join(place.directory, 'hook.lock');
  fs.mkdirSync(lock);
  try { return processEvent(input, place); }
  finally { fs.rmdirSync(lock); }
}

if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const expected = process.argv[process.argv.indexOf('--workspace') + 1];
    const scoped = process.argv.includes('--workspace') && fs.realpathSync(input.cwd) !== fs.realpathSync(expected);
    process.stdout.write(JSON.stringify(scoped ? {} : handle(input)));
  }
  catch (error) { process.stderr.write(`GenOS session gate failed: ${error.message}`); process.exitCode = 2; }
}

module.exports = { handle };
