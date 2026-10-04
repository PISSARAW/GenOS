'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { isAllowedSandboxTestCommand, normalizeSandboxCommand } = require('./sandboxCommandPolicy');

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_regeneration_checks (
    mission_id TEXT NOT NULL, role TEXT NOT NULL, commands_json TEXT NOT NULL,
    configured_by TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (mission_id, role), CHECK (json_valid(commands_json))
  );
  CREATE TABLE IF NOT EXISTS mission_regeneration_verifications (
    id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, lost_agent_id TEXT NOT NULL,
    replacement_id TEXT NOT NULL, role TEXT NOT NULL, report_evidence_ref TEXT NOT NULL,
    outcome TEXT NOT NULL, executions_json TEXT NOT NULL, created_at TEXT NOT NULL,
    CHECK (outcome IN ('verified','failed')), CHECK (json_valid(executions_json))
  );`);
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'MISSION_REGENERATION_CHECKS_INVALID', status: 400 });
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > 4) {
    throw invalid('Between one and four configured regeneration checks are required.');
  }
  const normalized = commands.map(normalizeSandboxCommand);
  if (new Set(normalized).size !== normalized.length || normalized.some(command =>
    !isAllowedSandboxTestCommand(command) || command.startsWith('echo '))) {
    throw invalid('Regeneration checks must be unique, executable test commands from the sandbox allowlist.');
  }
  return normalized;
}

async function configure(db, input) {
  if (!input?.missionId || typeof input.role !== 'string' || !input.role.trim()
    || typeof input.actor !== 'string' || !input.actor.trim()) throw invalid('Mission, role and actor are required.');
  const commands = normalizeCommands(input.commands);
  await ensureStorage(db);
  return withTransaction(db, async () => {
    const previous = await get(db, input.missionId, input.role);
    if (previous) {
      if (JSON.stringify(previous.commands) !== JSON.stringify(commands)) {
        throw Object.assign(new Error('Regeneration checks are immutable for this mission and role.'), { code: 'MISSION_REGENERATION_CHECKS_CONFLICT', status: 409 });
      }
      return previous;
    }
    const mission = await db.get('SELECT status FROM missions WHERE mission_id = ?', input.missionId);
    if (!mission || !['active', 'dormant'].includes(mission.status)) throw invalid('Mission must be active or dormant.');
    await db.run(`INSERT INTO mission_regeneration_checks
      (mission_id, role, commands_json, configured_by, created_at) VALUES (?, ?, ?, ?, ?)`,
    input.missionId, input.role, JSON.stringify(commands), input.actor, new Date().toISOString());
    return get(db, input.missionId, input.role);
  });
}

async function configureMission(db, input) {
  const checks = input.checks || {};
  if (typeof checks !== 'object' || Array.isArray(checks) || Object.keys(checks).length > 16) {
    throw invalid('regenerationChecks must map at most sixteen roles to command lists.');
  }
  for (const [role, commands] of Object.entries(checks)) {
    await configure(db, { missionId: input.missionId, role, commands, actor: 'mission_request' });
  }
}

async function initializeMission(db, input) {
  return withTransaction(db, async () => {
    await require('./missionIdentityService').create(db, {
      missionId: input.missionId, objective: input.objective
    });
    await configureMission(db, input);
  });
}

async function get(db, missionId, role) {
  await ensureStorage(db);
  const row = await db.get('SELECT * FROM mission_regeneration_checks WHERE mission_id = ? AND role = ?', missionId, role);
  return row ? { missionId, role, commands: JSON.parse(row.commands_json), configuredBy: row.configured_by } : null;
}

async function verify(db, input) {
  const policy = await get(db, input.missionId, input.role);
  if (!policy || !input.workspaceRoot) return { success: false, reason: 'Mission checks or workspace are missing.' };
  const executions = [];
  for (const command of policy.commands) {
    const outcome = await executeCheck({ command, workspaceRoot: input.workspaceRoot });
    executions.push(outcome);
    if (!outcome.success) break;
  }
  const success = executions.length === policy.commands.length && executions.every(entry => entry.success);
  const receipt = {
    id: `regen_verify_${crypto.randomUUID()}`, missionId: input.missionId,
    lostAgentId: input.lostAgentId, replacementId: input.replacementId,
    role: input.role, reportEvidenceRef: input.reportEvidenceRef,
    outcome: success ? 'verified' : 'failed', executions, createdAt: new Date().toISOString()
  };
  await persistReceipt(db, receipt);
  const evidenceRef = `sha256:${crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  return { success, evidenceRef, receipt, reason: success ? null : 'An independent mission check failed.' };
}

async function executeCheck(input) {
  try {
    const run = await require('./sandboxExecutor').runIsolated({
      command: input.command, cwd: input.workspaceRoot, timeoutMs: 30000
    });
    return { command: input.command, executionId: run.executionId, processId: run.processId,
      commandHash: run.commandHash, exitCode: run.exitCode, timedOut: run.timedOut,
      success: validExecution(run, input.command),
      stdoutHash: digest(run.stdout), stderrHash: digest(run.stderr) };
  } catch (error) {
    return { command: input.command, success: false, errorCode: error.code || 'CHECK_EXECUTION_FAILED' };
  }
}

function validExecution(run, command) {
  const commandHash = `sha256:${crypto.createHash('sha256').update(command).digest('hex')}`;
  return run.command === command && run.commandHash === commandHash
    && typeof run.executionId === 'string' && Number.isInteger(run.processId) && run.processId > 0
    && run.success === true && run.exitCode === 0 && run.timedOut !== true;
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function persistReceipt(db, receipt) {
  await db.run(`INSERT INTO mission_regeneration_verifications
    (id, mission_id, lost_agent_id, replacement_id, role, report_evidence_ref,
     outcome, executions_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  receipt.id, receipt.missionId, receipt.lostAgentId, receipt.replacementId,
  receipt.role, receipt.reportEvidenceRef, receipt.outcome,
  JSON.stringify(receipt.executions), receipt.createdAt);
}

module.exports = { configure, configureMission, initializeMission, get, verify, ensureStorage };
