'use strict';

const crypto = require('crypto');
const { treeHash } = require('./canonical');
const { verifyObjectSignatureLocal } = require('./verifyHelpers.cjs');
const { checkOutcomeInvariants } = require('./causalOps.cjs');

function verifyMergeEvidence(ctx) {
  const sourceIssues = ctx.sources.flatMap(verifySource);
  const invariantIssues = Object.entries(checkOutcomeInvariants(ctx.mergedState))
    .filter(([, valid]) => valid === false)
    .map(([name]) => ({ issue: 'merged_invariant_failed', invariant: name }));
  const issues = [...sourceIssues, ...invariantIssues];
  return { verified: issues.length === 0, issues };
}

function verifySource(object) {
  const issues = [];
  let state;
  try { state = JSON.parse(object.state_json || '{}'); } catch (_) {
    return [{ objectId: object.id, issue: 'invalid_json' }];
  }
  const stateHash = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
  if (stateHash !== object.state_hash) issues.push({ objectId: object.id, issue: 'state_hash_mismatch' });
  if (object.tree_hash && treeHash(state) !== object.tree_hash) issues.push({ objectId: object.id, issue: 'tree_hash_mismatch' });
  if (!verifyObjectSignatureLocal(object)) issues.push({ objectId: object.id, issue: 'invalid_signature' });
  return issues;
}

module.exports = { verifyMergeEvidence, verifySource };
