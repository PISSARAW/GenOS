'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const scopes = require('./missionModelBudgetScope');

function invalid(reason) {
  return Object.assign(new Error(reason), { code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID' });
}

function parseScope(mission) {
  let scope;
  try { scope = JSON.parse(mission.modelBudgetScopeJson || 'null'); }
  catch (_) { throw invalid('Subprocess model budget scope is malformed.'); }
  return scopes.validScope(scope);
}

async function assertDatabaseFile(filename) {
  if (!filename || !path.isAbsolute(filename)) {
    throw invalid('Subprocess model routing requires an absolute shared database path.');
  }
  let stat;
  try { stat = await fs.stat(filename); }
  catch (_) { throw invalid('Shared model budget database does not exist.'); }
  if (!stat.isFile()) throw invalid('Shared model budget database is not a file.');
}

async function openForMission(mission, runtimeBudget, filename = process.env.GENOS_DB_PATH) {
  const scope = parseScope(mission);
  if (!Number.isSafeInteger(runtimeBudget?.tokens) || runtimeBudget.tokens <= 0
    || runtimeBudget.tokens > scope.tokens
    || !Number.isFinite(runtimeBudget?.costUsd) || runtimeBudget.costUsd < 0
    || runtimeBudget.costUsd > scope.costUsd) {
    throw invalid('Subprocess model routing requires bounded child cost and token ceilings.');
  }
  await assertDatabaseFile(filename);
  const db = await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READWRITE });
  try {
    await db.exec('PRAGMA busy_timeout = 30000');
    const limits = await scopes.routeBudget({ agentId: mission.agentId,
      orchestratorAgentId: mission.orchestratorAgentId,
      modelBudgetScope: scope, executionBudget: runtimeBudget }, db);
    return { db, ...limits };
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function close(route) {
  if (route?.db) await route.db.close();
}

module.exports = { openForMission, close };
