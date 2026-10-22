'use strict';

const {
  failure,
  text,
  optionalText,
  digest,
  isoTimestamp,
  stringList,
  optionalStringList,
  ensureUniqueIds,
  targetInScope,
  canonicalValue,
  fingerprint
} = require('./serePrimitives');

function normalizeAuthorizedAction(item, mandate) {
  if (!item || typeof item !== 'object') throw failure('SERE_AUTHORIZED_ACTION_INVALID');
  const target = text(item.target, 'SERE_AUTHORIZED_ACTION_TARGET_REQUIRED', 512);
  const body = {
    id: text(item.id, 'SERE_AUTHORIZED_ACTION_ID_REQUIRED', 128),
    actionType: text(item.actionType, 'SERE_AUTHORIZED_ACTION_TYPE_REQUIRED', 128).toLowerCase(),
    target,
    inScope: targetInScope(target, mandate.scope),
    commandOrTool: text(item.commandOrTool, 'SERE_AUTHORIZED_ACTION_TOOL_REQUIRED', 512),
    authorizedBy: text(item.authorizedBy, 'SERE_AUTHORIZED_ACTION_AUTHORIZER_REQUIRED', 256),
    leaseRef: text(item.leaseRef, 'SERE_AUTHORIZED_ACTION_LEASE_REQUIRED', 256)
  };
  return { ...body, authorizedActionHash: fingerprint(body) };
}

function normalizeExecutedAction(item, context) {
  if (!item || typeof item !== 'object') throw failure('SERE_EXECUTED_ACTION_INVALID');
  const authorizedActionId = optionalText(item.authorizedActionId, 'SERE_EXECUTED_ACTION_AUTH_ID_INVALID', 128);
  const matched = authorizedActionId ? context.authorizedById.get(authorizedActionId) : null;
  const target = text(item.target, 'SERE_EXECUTED_ACTION_TARGET_REQUIRED', 512);
  const actionType = text(item.actionType, 'SERE_EXECUTED_ACTION_TYPE_REQUIRED', 128).toLowerCase();
  const inScope = targetInScope(target, context.mandate.scope);
  const authorized = Boolean(
    matched && matched.inScope && inScope && matched.actionType === actionType && matched.target === target
  );
  const status = text(item.status, 'SERE_EXECUTED_ACTION_STATUS_REQUIRED', 64).toLowerCase();
  if (!['succeeded', 'failed', 'aborted', 'blocked'].includes(status)) {
    throw failure('SERE_EXECUTED_ACTION_STATUS_INVALID');
  }
  const body = {
    id: text(item.id, 'SERE_EXECUTED_ACTION_ID_REQUIRED', 128),
    authorizedActionId,
    actionType,
    target,
    actorId: text(item.actorId, 'SERE_EXECUTED_ACTION_ACTOR_REQUIRED', 256),
    executedAt: isoTimestamp(item.executedAt, 'SERE_EXECUTED_ACTION_TIMESTAMP_REQUIRED'),
    status,
    inScope,
    authorized,
    receiptRef: text(item.receiptRef, 'SERE_EXECUTED_ACTION_RECEIPT_REF_REQUIRED', 1024),
    receiptHash: digest(item.receiptHash, 'SERE_EXECUTED_ACTION_RECEIPT_HASH_INVALID')
  };
  return { ...body, executedActionHash: fingerprint(body) };
}

function reconcileActions(authorized, executed) {
  const usedAuthIds = new Set();
  const authorizedAndExecuted = [];
  const unauthorizedExecuted = [];
  for (const exec of executed) {
    if (exec.authorized && exec.authorizedActionId) {
      usedAuthIds.add(exec.authorizedActionId);
      authorizedAndExecuted.push(exec.id);
    } else {
      unauthorizedExecuted.push(exec.id);
    }
  }
  const authorizedNotExecuted = authorized
    .filter((auth) => !usedAuthIds.has(auth.id))
    .map((auth) => auth.id);
  return {
    authorizedCount: authorized.length,
    executedCount: executed.length,
    authorizedAndExecuted,
    authorizedNotExecuted,
    unauthorizedExecuted
  };
}

function normalizeActions(input, mandate) {
  if (!input || typeof input !== 'object') throw failure('SERE_ACTIONS_REQUIRED');
  if (!Array.isArray(input.authorized) || input.authorized.length === 0) {
    throw failure('SERE_AUTHORIZED_ACTIONS_REQUIRED');
  }
  if (!Array.isArray(input.executed)) {
    throw failure('SERE_EXECUTED_ACTIONS_REQUIRED');
  }
  const authorized = ensureUniqueIds(
    input.authorized.map((item) => normalizeAuthorizedAction(item, mandate)),
    'SERE_AUTHORIZED_ACTION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const authorizedById = new Map(authorized.map((item) => [item.id, item]));
  const executed = ensureUniqueIds(
    input.executed.map((item) => normalizeExecutedAction(item, { mandate, authorizedById })),
    'SERE_EXECUTED_ACTION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const reconciliation = reconcileActions(authorized, executed);
  const body = { authorized, executed, reconciliation };
  return { ...body, sectionHash: fingerprint(body) };
}

function normalizeSnapshotEndpoint(endpoint, prefix) {
  if (!endpoint || typeof endpoint !== 'object') throw failure(`${prefix}_REQUIRED`);
  return {
    snapshotId: text(endpoint.snapshotId, `${prefix}_SNAPSHOT_ID_REQUIRED`, 128),
    digest: digest(endpoint.digest, `${prefix}_DIGEST_INVALID`),
    summary: text(endpoint.summary, `${prefix}_SUMMARY_REQUIRED`, 1024),
    metrics: canonicalValue(endpoint.metrics || {})
  };
}

function normalizeBeforeAfterItem(item) {
  if (!item || typeof item !== 'object') throw failure('SERE_DIFF_ITEM_INVALID');
  const before = normalizeSnapshotEndpoint(item.before, 'SERE_DIFF_BEFORE');
  const after = normalizeSnapshotEndpoint(item.after, 'SERE_DIFF_AFTER');
  const actionIds = stringList(item.actionIds, 'SERE_DIFF_ACTIONS_REQUIRED');
  if (actionIds.length === 0) throw failure('SERE_DIFF_ACTIONS_REQUIRED');
  const changed = before.digest !== after.digest;
  const deltaInput = item.delta || {};
  const body = {
    id: text(item.id, 'SERE_DIFF_ID_REQUIRED', 128),
    target: text(item.target, 'SERE_DIFF_TARGET_REQUIRED', 512),
    category: text(item.category, 'SERE_DIFF_CATEGORY_REQUIRED', 128).toLowerCase(),
    before,
    after,
    delta: {
      changed: deltaInput.changed !== undefined ? Boolean(deltaInput.changed) : changed,
      summary: text(deltaInput.summary || item.summary, 'SERE_DIFF_SUMMARY_REQUIRED', 2048),
      added: optionalStringList(deltaInput.added, 'SERE_DIFF_ADDED_INVALID'),
      removed: optionalStringList(deltaInput.removed, 'SERE_DIFF_REMOVED_INVALID'),
      metricDelta: canonicalValue(deltaInput.metricDelta || {})
    },
    actionIds,
    verifierId: text(item.verifierId, 'SERE_DIFF_VERIFIER_REQUIRED', 256),
    verifierReceiptHash: digest(item.verifierReceiptHash, 'SERE_DIFF_RECEIPT_HASH_INVALID')
  };
  return { ...body, diffHash: fingerprint(body) };
}

function normalizeBeforeAfter(input) {
  if (!Array.isArray(input) || input.length === 0) throw failure('SERE_BEFORE_AFTER_REQUIRED');
  const items = ensureUniqueIds(
    input.map(normalizeBeforeAfterItem),
    'SERE_DIFF_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const body = {
    totalDiffs: items.length,
    changedCount: items.filter((item) => item.delta.changed).length,
    items
  };
  return { ...body, sectionHash: fingerprint(body) };
}

function normalizeVisibilityLimitationItem(item) {
  if (!item || typeof item !== 'object') throw failure('SERE_LIMITATION_INVALID');
  const body = {
    id: text(item.id, 'SERE_LIMITATION_ID_REQUIRED', 128),
    scope: text(item.scope, 'SERE_LIMITATION_SCOPE_REQUIRED', 512),
    category: text(item.category, 'SERE_LIMITATION_CATEGORY_REQUIRED', 128).toLowerCase(),
    description: text(item.description, 'SERE_LIMITATION_DESCRIPTION_REQUIRED', 2048),
    reason: text(item.reason, 'SERE_LIMITATION_REASON_REQUIRED', 1024),
    impactOnConclusion: text(item.impactOnConclusion, 'SERE_LIMITATION_IMPACT_REQUIRED', 1024),
    affectedHypothesisIds: optionalStringList(item.affectedHypothesisIds, 'SERE_LIMITATION_HYPOTHESES_INVALID')
  };
  return { ...body, limitationHash: fingerprint(body) };
}

function normalizeVisibilityLimitations(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw failure('SERE_VISIBILITY_LIMITATIONS_REQUIRED');
  }
  const items = ensureUniqueIds(
    input.map(normalizeVisibilityLimitationItem),
    'SERE_LIMITATION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const body = {
    totalLimitations: items.length,
    categories: [...new Set(items.map((item) => item.category))].sort(),
    items
  };
  return { ...body, sectionHash: fingerprint(body) };
}

function normalizeResponsibleActor(responsible) {
  if (!responsible || typeof responsible !== 'object') {
    throw failure('SERE_DECISION_RESPONSIBLE_REQUIRED');
  }
  return {
    actorId: text(responsible.actorId, 'SERE_DECISION_ACTOR_ID_REQUIRED', 256),
    name: text(responsible.name, 'SERE_DECISION_ACTOR_NAME_REQUIRED', 256),
    role: text(responsible.role, 'SERE_DECISION_ACTOR_ROLE_REQUIRED', 128),
    authorityRef: text(responsible.authorityRef, 'SERE_DECISION_AUTHORITY_REF_REQUIRED', 512)
  };
}

function normalizeDecisionItem(item) {
  if (!item || typeof item !== 'object') throw failure('SERE_DECISION_INVALID');
  const disposition = text(item.disposition, 'SERE_DECISION_DISPOSITION_REQUIRED', 64).toLowerCase();
  if (!['remediate', 'quarantine', 'escalate', 'accept_risk', 'no_action', 'hold_promotion'].includes(disposition)) {
    throw failure('SERE_DECISION_DISPOSITION_INVALID');
  }
  const evidenceRefs = stringList(item.evidenceRefs, 'SERE_DECISION_EVIDENCE_REQUIRED');
  if (evidenceRefs.length === 0) throw failure('SERE_DECISION_EVIDENCE_REQUIRED');
  const body = {
    id: text(item.id, 'SERE_DECISION_ID_REQUIRED', 128),
    title: text(item.title, 'SERE_DECISION_TITLE_REQUIRED', 512),
    disposition,
    responsible: normalizeResponsibleActor(item.responsible),
    decidedAt: isoTimestamp(item.decidedAt, 'SERE_DECISION_TIMESTAMP_REQUIRED'),
    rationale: text(item.rationale, 'SERE_DECISION_RATIONALE_REQUIRED', 2048),
    evidenceRefs,
    receiptHash: digest(item.receiptHash, 'SERE_DECISION_RECEIPT_HASH_INVALID')
  };
  return { ...body, decisionHash: fingerprint(body) };
}

function normalizeDecisions(input) {
  if (!Array.isArray(input) || input.length === 0) throw failure('SERE_DECISIONS_REQUIRED');
  const items = ensureUniqueIds(
    input.map(normalizeDecisionItem),
    'SERE_DECISION_ID_DUPLICATE'
  ).sort((left, right) => left.id.localeCompare(right.id));
  const body = {
    totalDecisions: items.length,
    dispositions: [...new Set(items.map((item) => item.disposition))].sort(),
    items
  };
  return { ...body, sectionHash: fingerprint(body) };
}

module.exports = {
  normalizeActions,
  normalizeBeforeAfter,
  normalizeVisibilityLimitations,
  normalizeDecisions
};
