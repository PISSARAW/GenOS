'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function method(kind) {
  if (enabled(kind, 'recovery_worker', 'RECOVERY')) return recoveryMethod();
  if (enabled(kind, 'liaison_worker', 'HANDOFF')) return handoffMethod();
  return null;
}

function enabled(kind, expected, suffix) {
  return kind === expected && process.env[`GENOS_COMPLIANCE_DETERMINISTIC_${suffix}`] === '1';
}

function recoveryMethod() {
  return { version: 1, methodId: 'restore_checkpoint', parameters: {
    path: 'state.txt', content: 'checkpoint', checkpointDigest: hash('checkpoint'),
    expectedCurrentDigest: hash('damaged')
  } };
}

function handoffMethod() {
  return { version: 1, methodId: 'prepare_handoff', parameters: {
    sourceGroup: 'producers', targetGroup: 'reviewers', items: [
      { sourceRef: 'handoff://compliance/brief', summary: 'Review the bounded design brief.' },
      { sourceRef: 'handoff://compliance/receipt', summary: 'Inspect the validation receipt.' }
    ]
  } };
}

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function missionOptions(kind) {
  return enabled(kind, 'recovery_worker', 'RECOVERY')
    ? { recoveryLease: { action: 'restore_checkpoint', path: 'state.txt' } } : {};
}

function prepareWorker(kind, worker, rootWorkspace) {
  if (!enabled(kind, 'recovery_worker', 'RECOVERY')) return;
  const root = worker.workspaceRoot || rootWorkspace;
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'state.txt'), 'damaged');
}

function reference(kind, content) {
  if (enabled(kind, 'recovery_worker', 'RECOVERY')) return recoveryReference(content);
  if (enabled(kind, 'liaison_worker', 'HANDOFF')) return handoffReference(content);
  return null;
}

function recoveryReference(content) {
  return content?.recoveryReceipt?.restoredState === `sha256:${hash('checkpoint')}`
    && /^solver:\/\/sha256:[a-f0-9]{64}$/u.test(content.recoveryReceipt.receiptId);
}

function handoffReference(content) {
  return content?.handoff?.deliveredRefs?.includes('handoff://compliance/brief')
    && content.handoff.recipientAcknowledged === false;
}

module.exports = { method, missionOptions, prepareWorker, reference };
