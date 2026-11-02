'use strict';

const { withTransaction } = require('../../db');
const memory = require('./memoryService');
const validation = require('./learningRuleValidation');
const store = require('../identity/storage');

async function record(db, input) {
  if (typeof input.id !== 'string' || !input.id) store.fail('LEARNING_MEMORY_ID_REQUIRED');
  if (typeof input.agentId !== 'string' || !input.agentId) store.fail('LEARNING_MEMORY_OWNER_REQUIRED');
  const receipt = validation.validate(input.update, input.feedback);
  const provenance = { ...input.provenance, status: 'validated_training_examples',
    validation: receipt, feedback: input.feedback };
  return withTransaction(db, async () => {
    await insert(db, { id: `${input.id}:check`, projectId: input.agentId, kind: 'decision',
      content: JSON.stringify({ update: input.update, feedback: input.feedback, receipt }),
      provenance: { ...input.provenance, status: 'learning_rule_check' } });
    if (!receipt.accepted) return receipt;
    const entry = { id: input.id, projectId: input.agentId, kind: 'constraint',
      content: JSON.stringify(input.update), provenance };
    const memoryId = await insert(db, entry);
    return { ...receipt, memoryId };
  });
}

async function insert(db, entry) {
  const prior = await db.get('SELECT * FROM ontogenesis_memory WHERE id = ?', entry.id);
  if (!prior) return memory.recordMemory(db, entry);
  if (prior.project_id !== entry.projectId || prior.kind !== entry.kind || prior.content !== entry.content
    || store.hash(JSON.parse(prior.provenance_json)) !== store.hash(entry.provenance)) {
    store.fail('LEARNING_MEMORY_IDEMPOTENCY_CONFLICT');
  }
  return prior.id;
}

function admitted(row) {
  try {
    const provenance = JSON.parse(row.provenance_json);
    if (provenance.status !== 'validated_training_examples') return null;
    const update = JSON.parse(row.content);
    const receipt = validation.validate(update, provenance.feedback);
    if (!receipt.accepted || store.hash(receipt) !== store.hash(provenance.validation)) return null;
    return update;
  } catch (_) { return null; }
}

function ordinal(row) {
  try { return Number(JSON.parse(row.provenance_json).ordinal) || 0; }
  catch (_) { return 0; }
}

async function list(db, agentId) {
  const rows = await memory.listMemories(db, agentId);
  rows.sort((left, right) => ordinal(left) - ordinal(right) || rank(left) - rank(right));
  const result = {};
  for (const row of rows) {
    invalidate(result, row);
    if (row.kind !== 'constraint') continue;
    const update = admitted(row);
    if (update) result[update.op] = update.rule;
  }
  return result;
}

function rank(row) { return row.kind === 'decision' ? 0 : 1; }

function invalidate(result, row) {
  try {
    if (JSON.parse(row.provenance_json).status !== 'learning_rule_check') return;
    const { feedback } = JSON.parse(row.content);
    if (!validation.validFeedback(feedback)) return;
    const rule = result[feedback.op];
    if (rule && !validation.matches(rule, feedback.examples)) delete result[feedback.op];
  } catch (_) { /* Malformed check records cannot authorize knowledge. */ }
}

module.exports = { record, list, admitted };
