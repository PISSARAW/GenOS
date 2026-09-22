'use strict';

const crypto = require('crypto');

function canonicalize(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return 'null';
}

function stripVolatileFields(state) {
  if (!state || typeof state !== 'object') return state;
  const { capturedAt, ...rest } = state;
  const agent = rest.agent ? { ...rest.agent } : rest.agent;
  if (agent) {
    delete agent.runtime_pid;
    delete agent.runtime_started_at;
    delete agent.updated_at;
  }
  return { ...rest, agent };
}

function canonicalizeState(state) {
  return canonicalize(stripVolatileFields(state));
}

function treeHash(state) {
  return crypto.createHash('sha256').update(canonicalizeState(state)).digest('hex');
}

function commitHash({ tree, parents, metadata }) {
  const payload = { tree, parents: parents || [], metadata: metadata || {} };
  return crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');
}

module.exports = { canonicalize, canonicalizeState, stripVolatileFields, treeHash, commitHash };
