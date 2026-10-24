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
      'SELECT id, metadata_json FROM agents WHERE id = ?',
      [agentId]
    );
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) { /* ignore */ }
    return { agentId: row.id,
      phenotypeId: metadata.phenotypeId || metadata.phenotype_id || null, metadata };
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

async function ensureBudgetLedger(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_budget_accounts (
    agent_id TEXT PRIMARY KEY,
    total REAL NOT NULL,
    used REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function persistedBudget(ctx, budget) {
  const db = resolveDb(ctx.db);
  await ensureBudgetLedger(db);
  await db.run(`INSERT INTO communication_budget_accounts(agent_id, total, used)
    VALUES (?, ?, 0) ON CONFLICT(agent_id) DO NOTHING`, ctx.agentId, budget.total);
  await db.run(`UPDATE communication_budget_accounts SET total = ?, updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ?`, budget.total, ctx.agentId);
  const row = await db.get('SELECT total, used FROM communication_budget_accounts WHERE agent_id = ?', ctx.agentId);
  return { total: Number(row.total), used: Number(row.used) };
}

async function reserveBudget(input) {
  const { db: suppliedDb, agentId, total, amount } = input || {};
  if (!agentId || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(total) || total < 0) {
    return { reserved: false, reason: 'BUDGET_INPUT_INVALID' };
  }
  const db = resolveDb(suppliedDb);
  await ensureBudgetLedger(db);
  await db.run(`INSERT INTO communication_budget_accounts(agent_id, total, used)
    VALUES (?, ?, 0) ON CONFLICT(agent_id) DO NOTHING`, agentId, total);
  await db.run(`UPDATE communication_budget_accounts SET total = ?, updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ?`, total, agentId);
  const result = await db.run(`UPDATE communication_budget_accounts SET used = used + ?, updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ? AND used + ? <= total`, amount, agentId, amount);
  const row = await db.get('SELECT total, used FROM communication_budget_accounts WHERE agent_id = ?', agentId);
  return { reserved: result.changes === 1, total: Number(row.total), used: Number(row.used),
    remaining: Math.max(0, Number(row.total) - Number(row.used)) };
}

function decisionChannel(decision) {
  if (decision.action === 'STIGMERGY') return 'STIGMERGY';
  if (decision.action === 'DIALOGUE') return 'DIALOGUE';
  if (decision.action === 'SIGNAL') return 'SIGNAL';
  return null;
}

function silenceForConstraint(decision, reasonCode) {
  return { ...decision, action: 'SILENCE', scope: 'SELF', recipients: [], grounding: 'none', ttlMs: 0,
    reasonCodes: [...new Set([...(decision.reasonCodes || []), reasonCode])],
    meta: { ...(decision.meta || {}), rejectedAction: decision.action, constraint: reasonCode } };
}

function enforceManifestChannel(manifest, decision) {
  if (decision.action === 'SILENCE') return { allowed: true, decision, channel: null };
  const channel = decisionChannel(decision);
  if (!channel || !manifest.allowedChannels.includes(channel)) {
    return { allowed: false, channel, decision: silenceForConstraint(decision, 'CHANNEL_NOT_ALLOWED') };
  }
  return { allowed: true, channel, decision };
}

function decisionCost(decision) {
  const value = Number(decision.meta?.cost);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function enforceManifestBudget(input) {
  const { db, manifest, decision } = input;
  if (decision.action === 'SILENCE') return { allowed: true, decision, reservation: null };
  const amount = decisionCost(decision);
  if (amount === null) {
    return { allowed: false, decision: silenceForConstraint(decision, 'COMMUNICATION_COST_UNAVAILABLE'), reservation: null };
  }
  const reservation = await reserveBudget({ db, agentId: manifest.agentId,
    total: manifest.communicationBudget.total, amount });
  if (!reservation.reserved) {
    return { allowed: false, decision: silenceForConstraint(decision, 'COMMUNICATION_BUDGET_EXHAUSTED'), reservation };
  }
  manifest.communicationBudget.used = reservation.used;
  return { allowed: true, decision, reservation };
}

async function buildManifest(ctx) {
  if (!ctx || !ctx.agentId) throw new Error('agentId is required.');
  const profile = await fetchAgentProfile(ctx);
  const phenotype = { ...phenotypeOf(ctx), id: phenotypeOf(ctx).id || profile?.phenotypeId };
  const effectiveCtx = { ...ctx, phenotype };
  const channels = channelsFor(effectiveCtx);
  const tools = toolsFor(effectiveCtx);
  const encoding = encodingFor(effectiveCtx);
  const policy = policyFor(effectiveCtx);
  const budget = await persistedBudget(ctx, budgetFor(effectiveCtx));
  const subscriptions = await fetchSubscriptions(ctx);
  const relations = await fetchRelations(ctx);
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

function validateManifestCollections(manifest, errors) {
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
  if (!Array.isArray(manifest.receiveTools)) errors.push('receiveTools must be an array.');
  if (!Array.isArray(manifest.subscriptions)) errors.push('subscriptions must be an array.');
}

function validateManifestPolicies(manifest, errors) {
  if (!VALID_ENCODINGS.includes(manifest.preferredEncoding)) {
    errors.push(`preferredEncoding must be one of: ${VALID_ENCODINGS.join(', ')}.`);
  }
  if (!VALID_POLICIES.includes(manifest.audiencePolicy)) {
    errors.push(`audiencePolicy must be one of: ${VALID_POLICIES.join(', ')}.`);
  }
  if (!VALID_POLICIES.includes(manifest.disclosurePolicy)) {
    errors.push(`disclosurePolicy must be one of: ${VALID_POLICIES.join(', ')}.`);
  }
}

function validateManifestBudget(manifest, errors) {
  if (!manifest.communicationBudget || typeof manifest.communicationBudget !== 'object') {
    errors.push('communicationBudget must be an object.');
    return;
  }
  const budget = manifest.communicationBudget;
  if (typeof budget.total !== 'number' || budget.total < 0) {
    errors.push('communicationBudget.total must be a non-negative number.');
  }
  if (typeof budget.used !== 'number' || budget.used < 0) {
    errors.push('communicationBudget.used must be a non-negative number.');
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest is required.'] };
  }
  const errors = [];
  validateManifestCollections(manifest, errors);
  validateManifestPolicies(manifest, errors);
  validateManifestBudget(manifest, errors);
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
  consumeBudget,
  reserveBudget,
  decisionChannel,
  enforceManifestChannel,
  enforceManifestBudget
};
