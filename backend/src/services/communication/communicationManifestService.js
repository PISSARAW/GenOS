'use strict';

/**
 * CommunicationManifest — per-agent communication contract (ADR 003x).
 *
 * Captures the agent's allowed channels, tools, budget, and policies in a
 * single serializable object. Built from phenotype + topology + DB state,
 * cached in memory, and validated before use by the CommunicationPolicyEngine.
 *
 * Channels: SIGNAL, STIGMERGY, UNICAST, MULTICAST, QUORUM, DIALOGUE.
 */

const { getDatabase } = require('../../db');

const VALID_CHANNELS = Object.freeze([
  'SIGNAL', 'STIGMERGY', 'UNICAST', 'MULTICAST', 'QUORUM', 'DIALOGUE'
]);

const VALID_ENCODINGS = Object.freeze([
  'formal-result', 'ontology-patch', 'contract-hash', 'semantic-fingerprint',
  'symbol-dialect', 'micro-utterance', 'dialogue-turn'
]);

const VALID_POLICIES = Object.freeze(['selective', 'open', 'restricted']);

const manifestCache = new Map();

const DEFAULT_BUDGET = Object.freeze({ total: 1000, used: 0 });

const CHANNEL_FROM_PHENOTYPE = Object.freeze({
  ScoutCell: ['SIGNAL'],
  BoundedWorker: ['SIGNAL'],
  AdaptiveWorker: ['SIGNAL', 'STIGMERGY', 'UNICAST'],
  Specialist: ['SIGNAL', 'STIGMERGY', 'UNICAST', 'DIALOGUE'],
  Verifier: ['SIGNAL', 'STIGMERGY', 'UNICAST', 'DIALOGUE'],
  SubOrchestrator: ['SIGNAL', 'STIGMERGY', 'UNICAST', 'MULTICAST', 'QUORUM'],
  Orchestrator: ['SIGNAL', 'STIGMERGY', 'UNICAST', 'MULTICAST', 'QUORUM', 'DIALOGUE'],
  ResidentDaemon: ['SIGNAL', 'UNICAST'],
  Reconciler: ['UNICAST']
});

function resolveDb(db) {
  if (db) return db;
  return getDatabase();
}

async function fetchAgentProfile(ctx) {
  const db = resolveDb(ctx.db);
  const agentId = ctx.agentId;
  try {
    const row = await db.get(
      'SELECT agent_id, phenotype_id, metadata_json FROM agents WHERE agent_id = ?',
      [agentId]
    );
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) { /* ignore */ }
    return { agentId: row.agent_id, phenotypeId: row.phenotype_id, metadata };
  } catch (_) {
    return null;
  }
}

async function fetchSubscriptions(ctx) {
  const db = resolveDb(ctx.db);
  try {
    const rows = await db.all(
      'SELECT topic FROM signal_subscriptions WHERE subscriber_agent_id = ? ORDER BY topic',
      [ctx.agentId]
    );
    return rows.map((r) => r.topic);
  } catch (_) {
    return [];
  }
}

async function fetchRelations(ctx) {
  const db = resolveDb(ctx.db);
  try {
    const rows = await db.all(
      `SELECT source_agent_id, target_agent_id, relation_type, weight
       FROM agent_relations WHERE source_agent_id = ? OR target_agent_id = ?`,
      [ctx.agentId, ctx.agentId]
    );
    return rows.map((r) => ({
      sourceAgentId: r.source_agent_id,
      targetAgentId: r.target_agent_id,
      relationType: r.relation_type,
      weight: Number(r.weight || 0)
    }));
  } catch (_) {
    return [];
  }
}

function phenotypeOf(ctx) {
  return ctx.phenotype || {};
}

function channelsFor(ctx) {
  const phenotype = phenotypeOf(ctx);
  const explicit = ctx.allowedChannels || phenotype.allowedChannels;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter((c) => VALID_CHANNELS.includes(c));
  }
  const phenotypeId = phenotype.id || phenotype.phenotypeId;
  const inherited = CHANNEL_FROM_PHENOTYPE[phenotypeId] || ['SIGNAL'];
  return inherited.filter((c) => VALID_CHANNELS.includes(c));
}

function toolsFor(ctx) {
  const phenotype = phenotypeOf(ctx);
  const profile = phenotype.communicationProfile || {};
  const send = [];
  const receive = [];
  if (profile.signal) send.push('publish_signal');
  if (profile.publish) send.push('send_message');
  if (profile.broadcast) send.push('broadcast_signal');
  if (profile.inbox) receive.push('read_inbox');
  receive.push('poll_topic');
  if (send.length === 0) send.push('publish_signal');
  return { send, receive };
}

function encodingFor(ctx) {
  const phenotype = phenotypeOf(ctx);
  const profile = phenotype.communicationProfile || {};
  if (profile.dialect) return 'symbol-dialect';
  if (profile.broadcast) return 'semantic-fingerprint';
  return ctx.preferredEncoding || 'semantic-fingerprint';
}

function policyFor(ctx) {
  const phenotype = phenotypeOf(ctx);
  const profile = phenotype.communicationProfile || {};
  if (profile.broadcast) return 'open';
  if (profile.publish) return 'selective';
  return 'restricted';
}

function budgetFor(ctx) {
  const phenotype = phenotypeOf(ctx);
  const spawnBudget = Number(phenotype.spawnBudget || 0);
  const total = Math.max(10, spawnBudget * 10 + 100);
  return { total, used: 0 };
}

async function buildManifest(ctx) {
  if (!ctx || !ctx.agentId) throw new Error('agentId is required.');
  const phenotype = phenotypeOf(ctx);
  const channels = channelsFor(ctx);
  const tools = toolsFor(ctx);
  const encoding = encodingFor(ctx);
  const policy = policyFor(ctx);
  const budget = budgetFor(ctx);
  const subscriptions = await fetchSubscriptions(ctx);
  const relations = await fetchRelations(ctx);
  const profile = await fetchAgentProfile(ctx);
  const manifest = {
    agentId: ctx.agentId,
    phenotypeId: (profile && profile.phenotypeId) || phenotype.id || 'unknown',
    allowedChannels: channels,
    sendTools: tools.send,
    receiveTools: tools.receive,
    subscriptions,
    preferredEncoding: encoding,
    audiencePolicy: policy,
    disclosurePolicy: policy,
    independenceConstraints: phenotype.independenceConstraints || {},
    relations,
    commonGround: phenotype.commonGround || 'standard',
    wakePolicy: phenotype.wakePolicy || 'signal_only',
    communicationBudget: Object.assign({}, budget)
  };
  manifestCache.set(ctx.agentId, manifest);
  return manifest;
}

function getManifest(agentId) {
  return manifestCache.get(agentId) || null;
}

function invalidateManifest(agentId) {
  manifestCache.delete(agentId);
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest is required.'] };
  }
  if (!manifest.agentId) errors.push('agentId is required.');
  if (!Array.isArray(manifest.allowedChannels)) {
    errors.push('allowedChannels must be an array.');
  } else {
    const invalid = manifest.allowedChannels.filter((c) => !VALID_CHANNELS.includes(c));
    if (invalid.length > 0) errors.push(`Invalid channels: ${invalid.join(', ')}.`);
  }
  if (!Array.isArray(manifest.sendTools) || manifest.sendTools.length === 0) {
    errors.push('sendTools must be a non-empty array.');
  }
  if (!Array.isArray(manifest.receiveTools)) {
    errors.push('receiveTools must be an array.');
  }
  if (!Array.isArray(manifest.subscriptions)) {
    errors.push('subscriptions must be an array.');
  }
  if (!VALID_ENCODINGS.includes(manifest.preferredEncoding)) {
    errors.push(`preferredEncoding must be one of: ${VALID_ENCODINGS.join(', ')}.`);
  }
  if (!VALID_POLICIES.includes(manifest.audiencePolicy)) {
    errors.push(`audiencePolicy must be one of: ${VALID_POLICIES.join(', ')}.`);
  }
  if (!VALID_POLICIES.includes(manifest.disclosurePolicy)) {
    errors.push(`disclosurePolicy must be one of: ${VALID_POLICIES.join(', ')}.`);
  }
  if (!manifest.communicationBudget || typeof manifest.communicationBudget !== 'object') {
    errors.push('communicationBudget must be an object.');
  } else {
    const b = manifest.communicationBudget;
    if (typeof b.total !== 'number' || b.total < 0) errors.push('communicationBudget.total must be a non-negative number.');
    if (typeof b.used !== 'number' || b.used < 0) errors.push('communicationBudget.used must be a non-negative number.');
  }
  return { valid: errors.length === 0, errors };
}

function checkBudget(manifest) {
  if (!manifest || !manifest.communicationBudget) return 0;
  const b = manifest.communicationBudget;
  const remaining = Number(b.total || 0) - Number(b.used || 0);
  return Math.max(0, remaining);
}

function consumeBudget(manifest, amount) {
  if (!manifest || !manifest.communicationBudget) return false;
  const b = manifest.communicationBudget;
  const remaining = Number(b.total || 0) - Number(b.used || 0);
  if (remaining < amount) return false;
  b.used = Number(b.used || 0) + amount;
  return true;
}

module.exports = {
  VALID_CHANNELS,
  buildManifest,
  getManifest,
  invalidateManifest,
  validateManifest,
  checkBudget,
  consumeBudget
};
