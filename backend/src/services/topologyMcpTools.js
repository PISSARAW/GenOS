'use strict';

const { getDatabase } = require('../db');

function publicComposition(result) {
  const matrix = result.matrix;
  const output = { ...result };
  if (matrix) output.matrix = { matrixId: matrix.matrixId, version: matrix.version };
  return output;
}

function compositionOptions(args) {
  const options = { ...(args.options || {}) };
  const aliases = { variantId: ['variant_id', 'variantId', 'variant'], scope: ['scope'],
    persistenceKey: ['persistence_key', 'persistenceKey'], configuration: ['configuration'],
    workerAssignments: ['worker_assignments', 'workerAssignments'] };
  for (const [key, names] of Object.entries(aliases)) options[key] = firstValue(args, names, options[key]);
  return options;
}

function firstValue(args, names, fallback) {
  for (const name of names) if (args[name]) return args[name];
  return fallback;
}

async function composeBiologicalMode(args = {}) {
  const context = {};
  try {
    assertBiologicalModeRequest(args);
    context.db = await getDatabase();
    if (args.community_id) return await resumeBiocenose(context, args);
    context.composition = await require('./biologicalTopologyService').composeMode({
      db: context.db,
      orchestratorId: args.orchestrator_id,
      mode: args.mode,
      mission: args.mission,
      options: compositionOptions(args)
    });
    if (args.execute_round === true) return await startBiocenose(context, args);
    return { configured: true, success: true, status: 'topology_composed',
      ...publicComposition(context.composition) };
  } catch (error) {
    return biologicalModeError(context, error);
  }
}

function assertBiologicalModeRequest(args) {
  assertExecutionRequest(args);
  assertContinuationRequest(args);
}

function assertExecutionRequest(args) {
  if (args.execute_round !== undefined && typeof args.execute_round !== 'boolean') {
    throw Object.assign(new Error('execute_round must be a boolean.'), {
      code: 'BIOCENOSE_EXECUTION_REQUEST_INVALID' });
  }
  if (args.execute_round && args.mode !== 'biocenose') {
    throw Object.assign(new Error('execute_round is supported only for Biocenose.'), {
      code: 'BIOCENOSE_EXECUTION_MODE_INVALID' });
  }
  if (args.execute_round && !String(args.orchestrator_id || '').trim()) {
    throw Object.assign(new Error('An orchestrator identity is required.'), {
      code: 'BIOCENOSE_PUBLIC_ACTOR_REQUIRED' });
  }
}

function assertContinuationRequest(args) {
  if (args.community_id && (args.mode !== 'biocenose' || args.execute_round !== true)) {
    throw Object.assign(new Error('Community continuation requires an explicit Biocenose round.'), {
      code: 'BIOCENOSE_CONTINUATION_REQUEST_INVALID' });
  }
  if (!args.community_id && (args.resume_token !== undefined || args.expected_revision !== undefined)) {
    throw Object.assign(new Error('Continuation proof requires community_id.'), {
      code: 'BIOCENOSE_CONTINUATION_REQUEST_INVALID' });
  }
}

async function resumeBiocenose(context, args) {
  context.composition = await require('./biocenose/runtime/publicCycleIdentityService')
    .verify(context.db, { communityId: args.community_id,
      actorId: args.orchestrator_id, token: args.resume_token,
      expectedRevision: args.expected_revision, mission: args.mission,
      variant: args.variant_id || args.variant });
  return executeBiocenoseRound(context.db, args, context.composition);
}

async function startBiocenose(context, args) {
  context.continuation = await require('./biocenose/runtime/publicCycleIdentityService')
    .issue(context.db, { communityId: context.composition.communityId,
      actorId: args.orchestrator_id });
  return executeBiocenoseRound(context.db, args, { ...context.composition,
    resumeToken: context.continuation.token });
}

async function biologicalModeError(context, error) {
  const session = context.db && context.composition?.communityId
    ? await require('./biocenose/communityStore').loadSession(
      context.db, context.composition.communityId).catch(() => null) : null;
  return { configured: true, success: false, status: 'tool_error', error: error.message,
    code: error.code || null, communityId: context.composition?.communityId || null,
    variant: context.composition?.variant || null, sessionRevision: session?.revision ?? null,
    resumeToken: context.continuation?.token || null };
}

async function executeBiocenoseRound(db, args, composition) {
  const biocenose = require('./biocenoseService');
  const journal = require('./biocenose/runtime/roundJournal');
  const cycle = await biocenose.runBiocenoseRound({ db, communityId: composition.communityId,
    actorId: args.orchestrator_id, variant: composition.variant });
  const session = await require('./biocenose/communityStore').loadSession(db, composition.communityId);
  const final = cycle.receipts.findLast((receipt) => receipt.step === 'record_community_judgment')?.result;
  return { configured: true, success: true, status: 'topology_cycle_recorded',
    communityId: composition.communityId, variant: composition.variant,
    resumeToken: composition.resumeToken || null, sessionRevision: session.revision,
    variantSelection: composition.variantSelection, cycleStatus: cycle.status,
    communityStatus: session.status, followUpStatus: cycle.followUpStatus || null,
    receipts: cycle.receipts.map((receipt) => ({ step: receipt.step,
      completedAt: receipt.completedAt, resultHash: journal.digest(receipt.result) })),
    judgmentId: final?.judgmentId || null, judgment: final?.judgment || null,
    ecologicalDecision: cycle.ecologicalDecision || null,
    ecologicalAction: cycle.ecologicalAction || null };
}

async function operateTopologySession(args = {}, caller = {}) {
  let db;
  try {
    db = await getDatabase();
    const result = await require('./topologySessionTools').applyTopologyOperation(db, args, caller);
    return { configured: true, success: true, status: 'topology_session_updated', ...result };
  } catch (error) {
    await require('./syncytium/benchmark/syncytiumRejectionReceiptService')
      .record(db, args, { error, callerId: caller.agentId || process.env.GENOS_AGENT_ID })
      .catch(() => {});
    return { configured: true, success: false, status: 'tool_error', error: error.message, code: error.code || null };
  }
}

module.exports = { composeBiologicalMode, operateTopologySession };
