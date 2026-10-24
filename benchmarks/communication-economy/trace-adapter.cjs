'use strict';

const { summarizeUsage } = require('./provider-usage.cjs');

const COST_FIELDS = ['verificationUsd', 'memoryUsd', 'planningUsd', 'retryUsd'];

function parseRows(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Trace must contain JSONL rows.');
  return text.trim().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSONL row ${index + 1}.`); }
  });
}

function assertRow(row, expected) {
  if (row.runId !== expected.runId || row.scenarioId !== expected.scenarioId
    || row.seed !== expected.seed || row.armId !== expected.armId
    || typeof row.taskId !== 'string' || !expected.taskIds.includes(row.taskId)) {
    throw new Error('Trace row does not match the declared run and shared task set.');
  }
  if (typeof row.verifiedAction !== 'boolean' || typeof row.informationLost !== 'boolean') {
    throw new Error(`Trace row ${row.taskId} must include verification and information-loss outcomes.`);
  }
  return row;
}

function costOf(row) {
  const costs = row.episodeCostsUsd;
  if (!costs || COST_FIELDS.some((field) => !Number.isFinite(costs[field]) || costs[field] < 0)) return null;
  return COST_FIELDS.reduce((sum, field) => sum + costs[field], 0);
}

function normalizeRow(row, expected) {
  const receipts = row.usageReceipts || [];
  const usage = summarizeUsage(receipts, { complete: row.modelCallsComplete === true,
    callIds: row.modelCalls || [] });
  const costUsd = costOf(row);
  return { ...row, usage, episodeCostUsd: costUsd,
    resourceUse: row.resourceUse || {}, sourceSystem: expected.sourceSystem };
}

function importTrial(text, expected) {
  const rows = parseRows(text).map((row) => normalizeRow(assertRow(row, expected), expected));
  const seen = new Set(rows.map((row) => row.taskId));
  if (seen.size !== expected.taskIds.length || expected.taskIds.some((id) => !seen.has(id))) {
    throw new Error('Trace must contain exactly one result for every shared task.');
  }
  return { runId: expected.runId, scenarioId: expected.scenarioId, seed: expected.seed,
    armId: expected.armId, sourceSystem: expected.sourceSystem, tasks: rows };
}

function importAgentSocietyTrace(text, expected) {
  return importTrial(text, { ...expected, armId: 'agentsociety', sourceSystem: 'agentsociety' });
}

function importGenosTrace(text, expected) {
  if (!['naive-broadcast', 'genos-zero-text', 'genos-d-full'].includes(expected.armId)) {
    throw new Error('Unknown GenOS benchmark arm.');
  }
  return importTrial(text, { ...expected, sourceSystem: 'genos' });
}

module.exports = { importAgentSocietyTrace, importGenosTrace, importTrial };
