'use strict';

/**
 * A-Team real adapter (ADR 0113, phase 1).
 *
 * Branches `runBenchmark({ scenarios, repetitions, executeCase })` onto real
 * missions: arm `solo` runs `action: orchestrate` (single orchestrator, no
 * handoffs and no repair by construction), arm `a_team_full` runs
 * `action: dispatch_team` (accepted then polled in SQLite until terminal
 * agent statuses). Both arms share the same mission text, model and budget
 * per scenario x repetition pair; only the topology differs.
 *
 * Outcome rule (never simulated): `succeeded` comes from the orchestrator
 * (stdout `success` for solo, `completed` agent status for the team),
 * `evidenceValid` requires at least one `EVIDENCE_REPORT` telemetry row for
 * the orchestrator or its children. Tokens come from
 * `token_usage.totalTokens` (solo stdout) or `strategy_execution_runs`
 * (team DB read). Missing data yields zeros, never estimates.
 *
 * Usage:
 *   const { createRealAdapter } = require('./realAdapter.cjs');
 *   const { executeCase } = createRealAdapter({ rootDir, model: 'qwen2.5:14b' });
 *   const { runBenchmark } = require('./benchmarkRunner.cjs');
 *   await runBenchmark({ scenarios: require('./scenarios-v1.json').scenarios, repetitions: 2, executeCase });
 */

const { spawnSync } = require('child_process');
const path = require('path');

const TERMINAL_STATUSES = Object.freeze([
  'blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined'
]);
const EVIDENCE_EVENT = 'EVIDENCE_REPORT';
const DEFAULT_POLL_MS = 5000;
const DEFAULT_MARGIN_MS = 60000;
const DEFAULT_TOKENS = 12000;
const DEFAULT_TIMEOUT_MS = 360000;
const TEAM_SUB_SYSTEMS = Object.freeze(['analysis', 'implementation']);

function createRealAdapter(config = {}) {
  const settings = resolveSettings(config);
  return { executeCase: (input) => executeCase({ settings, input }) };
}

function resolveSettings(config) {
  const rootDir = config.rootDir || path.resolve(__dirname, '../..');
  return {
    rootDir,
    orchestratePath: config.orchestratePath || path.join(rootDir, 'backend/bin/genos-orchestrate.cjs'),
    dbPath: config.dbPath || process.env.GENOS_DB_PATH || path.join(rootDir, 'backend/genos.db'),
    model: config.model || null,
    pollMs: positiveOr(config.pollIntervalMs, DEFAULT_POLL_MS),
    marginMs: positiveOr(config.marginMs, DEFAULT_MARGIN_MS),
    spawnMission: config.spawnMission || defaultSpawnMission,
    openDb: config.openDb || defaultOpenDb
  };
}

async function executeCase(job) {
  const scenario = normalizeScenario(job.input.scenario);
  const arm = normalizeArm(job.input.arm);
  const budget = normalizeBudget(scenario.budget);
  if (arm === 'solo') return runSolo({ settings: job.settings, scenario, budget });
  return runTeam({ settings: job.settings, scenario, budget });
}

function normalizeScenario(scenario) {
  if (!scenario || typeof scenario.scenarioId !== 'string' || !scenario.scenarioId) {
    throw coded('Benchmark scenarioId is required.', 'ATEAM_ADAPTER_SCENARIO_REQUIRED');
  }
  if (typeof scenario.mission !== 'string' || !scenario.mission.trim()) {
    throw coded('Benchmark mission text is required.', 'ATEAM_ADAPTER_MISSION_REQUIRED');
  }
  return scenario;
}

function normalizeArm(arm) {
  const id = arm && arm.id;
  if (id === 'solo' || id === 'a_team_full') return id;
  throw coded(`Unsupported arm for real adapter: ${String(id)}.`, 'ATEAM_ADAPTER_ARM_UNSUPPORTED');
}

function normalizeBudget(budget = {}) {
  return {
    tokens: positiveOr(budget.tokens, DEFAULT_TOKENS),
    timeoutMs: positiveOr(budget.timeoutMs, DEFAULT_TIMEOUT_MS)
  };
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function runSolo(job) {
  const request = { action: 'orchestrate', mission: job.scenario.mission, timeoutMs: job.budget.timeoutMs };
  const result = await job.settings.spawnMission({
    orchestratePath: job.settings.orchestratePath, request,
    timeoutMs: job.budget.timeoutMs + job.settings.marginMs, model: job.settings.model
  });
  const parsed = parseOutput(result.stdout);
  if (!parsed) return failureOutcome(result.elapsedMs);
  return {
    succeeded: parsed.success === true,
    evidenceValid: hasEvidence(parsed.telemetry),
    elapsedMs: result.elapsedMs,
    tokenCost: tokensFrom(parsed.token_usage)
  };
}

async function runTeam(job) {
  const request = buildTeamRequest({ scenario: job.scenario, budget: job.budget });
  const startedAt = Date.now();
  const result = await job.settings.spawnMission({
    orchestratePath: job.settings.orchestratePath, request,
    timeoutMs: job.settings.marginMs, model: job.settings.model
  });
  const parsed = parseOutput(result.stdout);
  if (!parsed || typeof parsed.orchestratorId !== 'string') return failureOutcome(result.elapsedMs);
  const db = await job.settings.openDb({ dbPath: job.settings.dbPath, rootDir: job.settings.rootDir });
  try {
    await waitForAgents({ db, id: parsed.orchestratorId, deadline: startedAt + job.budget.timeoutMs + job.settings.marginMs, pollMs: job.settings.pollMs });
    return readTeamOutcome({ db, id: parsed.orchestratorId, elapsedMs: Date.now() - startedAt });
  } finally {
    await closeDb(db);
  }
}

function buildTeamRequest(job) {
  return {
    action: 'dispatch_team',
    mission: job.scenario.mission,
    project_goal: job.scenario.mission,
    sub_systems: Array.isArray(job.scenario.subSystems) && job.scenario.subSystems.length ? job.scenario.subSystems : [...TEAM_SUB_SYSTEMS],
    success_criteria: job.scenario.verifierId || null,
    execution_budget: { tokens: job.budget.tokens },
    timeoutMs: job.budget.timeoutMs
  };
}

function defaultSpawnMission(job) {
  const startedAt = Date.now();
  const env = { ...process.env };
  if (job.model) env.GENOS_DEFAULT_MODEL = job.model;
  const spawned = spawnSync(process.execPath, [job.orchestratePath, JSON.stringify(job.request)], {
    encoding: 'utf8', timeout: job.timeoutMs, env, maxBuffer: 64 * 1024 * 1024
  });
  return { stdout: spawned.stdout || '', stderr: spawned.stderr || '', exitCode: spawned.status, elapsedMs: Date.now() - startedAt };
}

async function defaultOpenDb(job) {
  const sqlite = require(path.join(job.rootDir, 'backend/node_modules/sqlite'));
  const sqlite3 = require(path.join(job.rootDir, 'backend/node_modules/sqlite3'));
  return sqlite.open({ filename: job.dbPath, driver: sqlite3.Database });
}

function parseOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  const candidate = lastJsonLine(text);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function lastJsonLine(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith('{')) return lines[index];
  }
  return text;
}

function hasEvidence(telemetry) {
  return Array.isArray(telemetry) && telemetry.some((row) => row && row.event_type === EVIDENCE_EVENT);
}

function tokensFrom(tokenUsage) {
  return finiteOr(Number(tokenUsage && tokenUsage.totalTokens), 0);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function failureOutcome(elapsedMs) {
  return { succeeded: false, evidenceValid: false, elapsedMs: finiteOr(elapsedMs, 0), tokenCost: 0 };
}

async function waitForAgents(job) {
  while (Date.now() < job.deadline) {
    const rows = await job.db.all('SELECT status FROM agents WHERE id = ? OR parent_agent_id = ?', job.id, job.id);
    if (rows.length && rows.every((row) => TERMINAL_STATUSES.includes(row.status))) return true;
    await sleep(job.pollMs);
  }
  return false;
}

async function readTeamOutcome(job) {
  const agent = await job.db.get('SELECT status FROM agents WHERE id = ?', job.id);
  const telemetry = await job.db.all(
    'SELECT event_type FROM telemetry_events WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?)',
    job.id, job.id
  );
  const runs = await job.db.all(
    'SELECT metrics_json FROM strategy_execution_runs WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?)',
    job.id, job.id
  );
  return {
    succeeded: !!agent && agent.status === 'completed',
    evidenceValid: hasEvidence(telemetry),
    elapsedMs: job.elapsedMs,
    tokenCost: sumRunTokens(runs)
  };
}

function sumRunTokens(runs) {
  return (Array.isArray(runs) ? runs : []).reduce((sum, run) => sum + tokensOf(run), 0);
}

function tokensOf(run) {
  try {
    return finiteOr(Number(JSON.parse(run.metrics_json || '{}').tokens || 0), 0);
  } catch (_) {
    return 0;
  }
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') await db.close().catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createRealAdapter, TERMINAL_STATUSES };
