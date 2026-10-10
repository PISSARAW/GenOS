'use strict';

const { digest } = require('./gvxVerifierRegistry');
const { error } = require('./gvxContracts');

const SCHEMA = 'genos.gvx.split-dataset/v1';

function candidateView(bytes, policy) {
  if (!policy) return { bytes, separation: 'legacy_unattested', candidateHash: digest(bytes) };
  if (policy.schema !== SCHEMA || !/^[a-f0-9]{64}$/.test(policy.candidateHash || '')) {
    throw error('GVX_CAMPAIGN_DATASET_POLICY_INVALID');
  }
  const envelope = parse(bytes);
  const view = Buffer.from(JSON.stringify({ schema: 'genos.gvx.candidate-dataset/v1',
    tasks: envelope.tasks.map(task => ({ id: task.id, input: task.input })) }));
  if (digest(view) !== policy.candidateHash) throw error('GVX_CAMPAIGN_CANDIDATE_DATASET_HASH_MISMATCH');
  return { bytes: view, candidateHash: digest(view), separation: 'candidate_input_projection', osIsolation: false };
}

function parse(bytes) {
  let envelope;
  try { envelope = JSON.parse(bytes.toString('utf8')); } catch (_) { throw error('GVX_CAMPAIGN_DATASET_FORMAT_INVALID'); }
  if (envelope?.schema !== SCHEMA || !closed(envelope, ['schema', 'tasks'])
      || !Array.isArray(envelope.tasks) || !envelope.tasks.length || envelope.tasks.length > 10000) {
    throw error('GVX_CAMPAIGN_DATASET_FORMAT_INVALID');
  }
  const ids = new Set();
  for (const task of envelope.tasks) {
    validateTask(task);
    if (ids.has(task.id)) throw error('GVX_CAMPAIGN_DATASET_TASK_DUPLICATE');
    ids.add(task.id);
  }
  return envelope;
}

function closed(object, keys) { return Object.keys(object).every(key => keys.includes(key)); }

function validateTask(task) {
  if (!task || typeof task.id !== 'string' || !task.id.trim() || task.id.length > 200
      || !closed(task, ['id', 'input', 'evaluation']) || !Object.hasOwn(task, 'input')
      || !Object.hasOwn(task, 'evaluation')) throw error('GVX_CAMPAIGN_DATASET_TASK_INVALID');
}

module.exports = { SCHEMA, candidateView };
