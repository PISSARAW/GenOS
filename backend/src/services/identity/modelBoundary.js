'use strict';

const crypto = require('crypto');
const store = require('./storage');
const incarnations = require('./incarnations');
const decisions = require('./decisions');

async function registered(options) {
  if (!options.db?.exec || !options.agentId) return false;
  if (!await store.table(options.db, 'agents')) return false;
  return Boolean(await options.db.get('SELECT id FROM agents WHERE id = ?', options.agentId));
}

async function run(options, execute) {
  if (!await registered(options)) return execute(options);
  const scope = requestedScope(options);
  await store.registration(options.db, { agentId: options.agentId, scope });
  const supplied = options.identitySession;
  const session = supplied || await incarnations.activate(options.db, { agentId: options.agentId,
    ownerId: `model:${crypto.randomUUID()}`, ttlMs: 900000 });
  try {
    if (session.agentId !== options.agentId) store.fail('IDENTITY_SESSION_AGENT_MISMATCH');
    await incarnations.assertSession(options.db, session);
    const model = await decisions.selfModel(options.db, { agentId: options.agentId });
    const domain = options.cognitiveDomain || options.cognitiveIntegration || 'runtime';
    const relevant = model.capabilities.find(item => item.domain === domain);
    const uncertainty = relevant?.observations >= 3 ? 1 - relevant.successProbability : null;
    const result = await execute({ ...options, identityContext: { session, selfModel: model },
      cognitiveUncertainty: Math.max(options.cognitiveUncertainty || 0, uncertainty || 0) });
    await incarnations.assertSession(options.db, session);
    return { ...result, identity: { agentId: session.agentId, incarnationId: session.incarnationId,
      fencingToken: session.fencingToken, dimensionsUsed: ['existence', 'continuity', 'characteristics'],
      uncertaintyApplied: uncertainty } };
  } finally {
    if (!supplied) await incarnations.release(options.db, session);
  }
}

function requestedScope(options) {
  if (Boolean(options.organizationId) !== Boolean(options.projectId)) store.fail('IDENTITY_SCOPE_REQUIRED');
  return options.organizationId ? { organizationId: options.organizationId, projectId: options.projectId } : undefined;
}

module.exports = { run };
