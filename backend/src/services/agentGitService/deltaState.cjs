'use strict';

const crypto = require('node:crypto');

const FORMAT = 'genos.agent-git-delta/v1';
const MAX_DEPTH = 8;

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function encodeDelta(parentId, parent, next, depth) {
  const set = Object.create(null);
  const remove = [];
  for (const key of Object.keys(next)) {
    if (JSON.stringify(parent[key]) !== JSON.stringify(next[key])) set[key] = next[key];
  }
  for (const key of Object.keys(parent)) if (!(key in next)) remove.push(key);
  return { $genosAgentGitStorage: FORMAT, base: parentId, depth, hash: hash(next),
    order: Object.keys(next), set, remove };
}

function chooseEncoding(parentId, parent, next, parentDepth = 0) {
  const full = JSON.stringify(next);
  if (!parentId || !parent || parentDepth >= MAX_DEPTH) return { serialized: full, depth: 0 };
  const depth = parentDepth + 1;
  const delta = JSON.stringify(encodeDelta(parentId, parent, next, depth));
  return delta.length < full.length * 0.8
    ? { serialized: delta, depth }
    : { serialized: full, depth: 0 };
}

function isDelta(value) {
  return value && value.$genosAgentGitStorage === FORMAT;
}

async function materialize(db, serialized, seen = new Set()) {
  const encoded = JSON.parse(serialized);
  if (!isDelta(encoded)) return serialized;
  if (!encoded.base || seen.has(encoded.base) || seen.size >= MAX_DEPTH) {
    throw new Error('AgentGit delta chain is cyclic or too deep.');
  }
  seen.add(encoded.base);
  const base = await db.get('SELECT state_json FROM agent_git_objects WHERE id = ?', encoded.base);
  if (!base) throw new Error('AgentGit delta base is missing.');
  const parent = JSON.parse(await materialize(db, base.state_json, seen));
  const next = encoded.order ? orderedState(encoded, parent) : legacyState(encoded, parent);
  if (hash(next) !== encoded.hash) throw new Error('AgentGit delta hash mismatch.');
  return JSON.stringify(next);
}

function orderedState(encoded, parent) {
  const next = Object.create(null);
  if (!Array.isArray(encoded.order) || new Set(encoded.order).size !== encoded.order.length) {
    throw new Error('AgentGit delta key order is invalid.');
  }
  for (const key of encoded.order) {
    if (Object.hasOwn(encoded.set, key)) next[key] = encoded.set[key];
    else if (Object.hasOwn(parent, key)) next[key] = parent[key];
    else throw new Error('AgentGit delta value is missing.');
  }
  return next;
}

function legacyState(encoded, parent) {
  for (const key of encoded.remove) delete parent[key];
  for (const [key, value] of Object.entries(encoded.set)) {
    Object.defineProperty(parent, key, { value, enumerable: true, configurable: true, writable: true });
  }
  return parent;
}

module.exports = { chooseEncoding, materialize, isDelta, MAX_DEPTH };
