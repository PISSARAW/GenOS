'use strict';

function aggregateAtParent(input) {
  const clusters = (input.clusters || []).map((cluster) => preserveCluster(cluster, input.isTrustedReceipt));
  const outcomes = new Set(clusters.map((cluster) => cluster.outcome));
  const bypasses = clusters.flatMap((cluster) => cluster.minorityEvidenceBypass);
  return {
    status: outcomes.size > 1 ? 'PLURALISM_RETAINED' : 'CLUSTER_JUDGMENTS_RETAINED',
    clusters, minorityEvidenceBypass: bypasses,
    parentMustReview: bypasses.length > 0
  };
}

function preserveCluster(cluster, isTrustedReceipt) {
  const distribution = (cluster.distribution || []).map((item) => ({
    position: item.position, share: clamp(item.share), memberCount: Number(item.memberCount) || 0
  }));
  return {
    clusterId: cluster.clusterId, outcome: cluster.outcome,
    distribution, dissent: cluster.dissent || [],
    minorityEvidenceBypass: verifiedMinorityEvidence(cluster, isTrustedReceipt)
  };
}

function verifiedMinorityEvidence(cluster, isTrustedReceipt) {
  const dissent = cluster.dissent || [];
  if (typeof isTrustedReceipt !== 'function') return [];
  return dissent.filter((item) => item.critical === true && item.receipt
    && isTrustedReceipt(item.receipt)).map((item) => ({
    clusterId: cluster.clusterId, dissentId: item.dissentId,
    evidenceRef: item.receipt.evidenceRef, receiptId: item.receipt.receiptId
  }));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

module.exports = { aggregateAtParent };
