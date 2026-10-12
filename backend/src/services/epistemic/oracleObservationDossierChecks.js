'use strict';

const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RECOVERY = new Set(['recovery_state_digest', 'recovery_receipt_replay']);
const HANDOFF = new Set(['handoff_set_projection', 'handoff_scan_projection']);

function outcome(status, reason, strategy) {
  return { schema: 'genos.native-observation-postconditions/v1', status, reason, strategy };
}

function checkHandoff(subject, strategy) {
  const input = subject.method.parameters;
  const handoff = subject.result?.handoff;
  if (!Array.isArray(input.items) || !handoff) return outcome('inconclusive', 'handoff_subject_invalid', strategy);
  const refs = strategy === 'handoff_set_projection' ? [...new Set(input.items.map(item => item.sourceRef))]
    : uniqueRefs(input.items);
  const valid = groupsMatch(input, handoff) && refsMatch(handoff, refs)
    && isDeepStrictEqual(handoff.items, input.items) && deliveryIsHonest(handoff)
    && receiptBound(subject, refs);
  return outcome(valid ? 'verified' : 'refuted', 'sourced_handoff_recomputed', strategy);
}

function groupsMatch(input, handoff) {
  return handoff.sourceGroup === input.sourceGroup && handoff.targetGroup === input.targetGroup
    && handoff.sourceGroup !== handoff.targetGroup;
}

function refsMatch(handoff, refs) { return isDeepStrictEqual(handoff.deliveredRefs, refs); }

function deliveryIsHonest(handoff) {
  return handoff.delivery === 'parent_dossier' && handoff.recipientAcknowledged === false;
}

function uniqueRefs(items) {
  const refs = [];
  for (const item of items) if (!refs.includes(item.sourceRef)) refs.push(item.sourceRef);
  return refs;
}

function receiptBound(subject, refs) {
  const receiptId = expectedReceiptId(subject.method, { handoff: normalizedHandoff(subject.result.handoff) });
  return isDeepStrictEqual(subject.result.claims?.[0]?.evidence, [...new Set([receiptId, ...refs])]);
}

function normalizedHandoff(handoff) {
  return { sourceGroup: handoff.sourceGroup, targetGroup: handoff.targetGroup,
    deliveredRefs: handoff.deliveredRefs, items: handoff.items.map(item => ({
      sourceRef: item.sourceRef, summary: item.summary
    })), delivery: handoff.delivery, recipientAcknowledged: handoff.recipientAcknowledged };
}

function checkRecovery(subject, strategy) {
  const input = subject.method.parameters;
  const observed = restoredFileDigest(subject.workspaceRoot, input.path, strategy);
  if (!observed) return outcome('inconclusive', 'recovery_target_unavailable', strategy);
  const expected = hash(input.content);
  const receiptResult = { path: input.path, restoredDigest: observed, priorDigest: input.expectedCurrentDigest };
  const receiptId = expectedReceiptId(subject.method, receiptResult);
  const recovery = subject.result.recoveryReceipt;
  const receiptValid = recovery?.action === 'restore_checkpoint' && recovery.restoredState === `sha256:${observed}`
    && recovery.receiptId === receiptId && isDeepStrictEqual(recovery.evidence, [receiptId]);
  const checkpointValid = subject.result.checkpointReceipt?.id === receiptId
    && isDeepStrictEqual(subject.result.checkpointReceipt.result, receiptResult);
  const valid = observed === input.checkpointDigest && observed === expected && receiptValid && checkpointValid;
  return outcome(valid ? 'verified' : 'refuted', 'checkpoint_state_and_receipt_recomputed', strategy);
}

function restoredFileDigest(root, relative, strategy) {
  const target = confinedTarget(root, relative);
  if (!target) return null;
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 1048576) return null;
    return hash(strategy === 'recovery_state_digest' ? fs.readFileSync(target) : readChunks(target));
  } catch (_) { return null; }
}

function confinedTarget(root, relative) {
  if (!validRecoveryPath(root, relative)) return null;
  try {
    const canonicalRoot = fs.realpathSync(root);
    const target = path.resolve(canonicalRoot, relative);
    if (!insideRoot(canonicalRoot, target) || fs.realpathSync(target) !== target) return null;
    return fs.lstatSync(target).isSymbolicLink() ? null : target;
  } catch (_) { return null; }
}

function validRecoveryPath(root, relative) {
  return typeof root === 'string' && Boolean(root) && typeof relative === 'string'
    && !path.isAbsolute(relative) && !relative.includes(':');
}

function insideRoot(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function readChunks(target) {
  const descriptor = fs.openSync(target, 'r');
  const chunks = [];
  const buffer = Buffer.alloc(16384);
  try {
    let count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) chunks.push(Buffer.from(buffer.subarray(0, count)));
    return Buffer.concat(chunks);
  } finally { fs.closeSync(descriptor); }
}

function expectedReceiptId(method, output) {
  const inputDigest = hash(JSON.stringify(normalizedMethod(method)));
  return `solver://sha256:${hash(JSON.stringify({ inputDigest, output }))}`;
}

function normalizedMethod(method) {
  const parameters = method.parameters;
  if (method.methodId === 'restore_checkpoint') return { version: 1, methodId: method.methodId,
    parameters: { path: parameters.path, content: parameters.content,
      checkpointDigest: parameters.checkpointDigest, expectedCurrentDigest: parameters.expectedCurrentDigest } };
  return { version: 1, methodId: method.methodId, parameters: {
    sourceGroup: parameters.sourceGroup, targetGroup: parameters.targetGroup, items: parameters.items
  } };
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

module.exports = { RECOVERY, HANDOFF, checkRecovery, checkHandoff };
