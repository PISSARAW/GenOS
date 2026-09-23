'use strict';

const { getDatabase } = require('../../db');
const { estimateNaiveBroadcast } = require('./communicationCostService');

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureShadowTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_shadow_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_json TEXT NOT NULL DEFAULT '{}', decision_json TEXT NOT NULL DEFAULT '{}',
    current_behavior_json TEXT NOT NULL DEFAULT '{}',
    utility REAL NOT NULL DEFAULT 0, gain REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(intent_json)), CHECK (json_valid(decision_json))
  );`);
  return db;
}

function reductionOf(cost, naive) {
  if (naive.total <= 0) return 0;
  return 1 - cost / naive.total;
}

function naiveInputsOf(input) {
  const behavior = input.currentBehavior || {};
  return { recipientCount: behavior.recipientCount || 42, coefficients: input.coefficients };
}

function shadowRowOf(input) {
  const decision = input.decision || {};
  const meta = decision.meta || {};
  const naive = estimateNaiveBroadcast(naiveInputsOf(input));
  return {
    values: [
      JSON.stringify(input.intent || {}), JSON.stringify(decision),
      JSON.stringify(input.currentBehavior || {}),
      Number(meta.utility || 0), Number(meta.gain || 0), Number(meta.cost || 0)
    ],
    naive
  };
}

function shadowReceiptOf(result, logged) {
  return {
    id: result.lastID, utility: logged.values[3], gain: logged.values[4],
    cost: logged.values[5], naiveCost: logged.naive.total,
    reduction: reductionOf(logged.values[5], logged.naive)
  };
}

async function logShadowDecision(input) {
  const db = await ensureShadowTables(input.db);
  const logged = shadowRowOf(input);
  const result = await db.run(
    `INSERT INTO communication_shadow_log
      (intent_json, decision_json, current_behavior_json, utility, gain, cost)
     VALUES (?, ?, ?, ?, ?, ?)`,
    logged.values
  );
  return shadowReceiptOf(result, logged);
}

module.exports = { logShadowDecision };
