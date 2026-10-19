'use strict';

const { fingerprint } = require('../stateFingerprint');
const { ALERT_SCHEMA } = require('./securityAlertContract');

const GRAPH_SCHEMA = 'genos.security-antigen-graph/v1';

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function assertAlert(alert) {
  if (alert?.schema !== ALERT_SCHEMA || typeof alert.antigenHash !== 'string') {
    throw failure('SECURITY_ANTIGEN_INVALID');
  }
}

function causeBasis(alert) {
  const semantic = alert.cwes.length > 0 || alert.trustBoundary
    || alert.sourceKind || alert.sinkKind;
  return semantic ? { cwes: alert.cwes, trustBoundary: alert.trustBoundary,
    sourceKind: alert.sourceKind, sinkKind: alert.sinkKind }
    : { ruleId: alert.ruleId };
}

function clusterSeed(alert) {
  const basis = causeBasis(alert);
  return { basis, causeHash: fingerprint(basis) };
}

function clusterRecord(seed, alerts) {
  const ordered = [...alerts].sort((a, b) => a.antigenHash.localeCompare(b.antigenHash));
  const paths = [...new Set(ordered.map((alert) => alert.location.path))].sort();
  const severities = [...new Set(ordered.map((alert) => alert.severity))].sort();
  const body = { causeHash: seed.causeHash, basis: seed.basis,
    antigenHashes: ordered.map((alert) => alert.antigenHash), paths, severities };
  return { id: `antigen-cluster-${seed.causeHash.slice(0, 16)}`, ...body,
    clusterHash: fingerprint(body), alertCount: ordered.length, promotionEligible: false };
}

function graphEdges(clusters) {
  return clusters.flatMap((cluster) => cluster.antigenHashes.map((antigenHash) => ({
    from: antigenHash, to: cluster.id, relation: 'shares_root_cause'
  })));
}

function buildAntigenGraph(batch) {
  if (batch?.schema !== 'genos.security-antigen-batch/v1'
      || !Array.isArray(batch.alerts) || !batch.alerts.length) {
    throw failure('SECURITY_ANTIGEN_BATCH_REQUIRED');
  }
  const grouped = new Map();
  for (const alert of batch.alerts) {
    assertAlert(alert);
    const seed = clusterSeed(alert);
    const current = grouped.get(seed.causeHash) || { seed, alerts: [] };
    current.alerts.push(alert);
    grouped.set(seed.causeHash, current);
  }
  const clusters = [...grouped.values()].map((entry) => clusterRecord(entry.seed,
    entry.alerts)).sort((a, b) => a.id.localeCompare(b.id));
  const body = { schema: GRAPH_SCHEMA, batchAlertCount: batch.alerts.length,
    clusters, edges: graphEdges(clusters), promotionEligible: false };
  return { ...body, graphHash: fingerprint(body) };
}

module.exports = { GRAPH_SCHEMA, buildAntigenGraph, causeBasis };
