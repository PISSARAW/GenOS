'use strict';
const { digest } = require('./trinityProvenanceValues');

function identityMatches(content, mission) {
  return content.reviewerId === mission.agentId && content.missionId === mission.missionId
    && Array.isArray(content.files) && content.files.length > 0;
}

function assertSnapshot(mission, files) {
  const snapshot = mission.delegatedReviewSnapshot;
  if (!snapshot) throw invalid();
  const { hash, receiptRef, ...content } = snapshot;
  if (!receiptRef || hash !== digest(content) || !identityMatches(content, mission)) throw invalid();
  const actual = new Map(files.map(file => [file.path, file.hash]));
  const expected = content.files;
  if (new Set(expected.map(file => file.path)).size !== expected.length
    || expected.some(file => actual.get(file.path) !== file.hash)) throw invalid();
  return { hash, receiptRef, sourceWorkerId: content.sourceWorkerId,
    sourceRunId: content.sourceRunId, sourceReceiptHash: content.sourceReceiptHash };
}

function invalid() {
  return Object.assign(new Error('Read-only review snapshot does not match its bound candidate.'), {
    code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
}

module.exports = { assertSnapshot };
