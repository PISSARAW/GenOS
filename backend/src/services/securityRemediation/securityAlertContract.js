'use strict';

const path = require('node:path');
const { fingerprint } = require('../stateFingerprint');

const ALERT_SCHEMA = 'genos.security-antigen/v1';
const MAX_ALERTS = 25;

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function text(value, code, limit = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw failure(code);
  return value.trim();
}

function relativePath(value) {
  const normalized = path.posix.normalize(text(value,
    'SECURITY_ALERT_PATH_REQUIRED').replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw failure('SECURITY_ALERT_PATH_OUTSIDE_WORKSPACE');
  }
  return normalized;
}

function stringList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return [...new Set(values.filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim()).filter(Boolean))].sort();
}

function locationFromSarif(result) {
  const physical = result.locations?.[0]?.physicalLocation;
  return { path: relativePath(physical?.artifactLocation?.uri),
    line: Math.max(1, Number(physical?.region?.startLine || 1)) };
}

function canonicalAlert(input) {
  const body = {
    schema: ALERT_SCHEMA,
    source: text(input.source, 'SECURITY_ALERT_SOURCE_REQUIRED', 64),
    externalId: text(input.externalId, 'SECURITY_ALERT_ID_REQUIRED', 256),
    ruleId: text(input.ruleId, 'SECURITY_ALERT_RULE_REQUIRED', 256),
    severity: String(input.severity || 'warning').toLowerCase(),
    message: text(input.message, 'SECURITY_ALERT_MESSAGE_REQUIRED', 2048),
    location: { path: relativePath(input.location?.path),
      line: Math.max(1, Number(input.location?.line || 1)) },
    cwes: stringList(input.cwes),
    trustBoundary: input.trustBoundary ? text(input.trustBoundary,
      'SECURITY_ALERT_TRUST_BOUNDARY_INVALID', 256) : null,
    sourceKind: input.sourceKind ? text(input.sourceKind,
      'SECURITY_ALERT_SOURCE_KIND_INVALID', 256) : null,
    sinkKind: input.sinkKind ? text(input.sinkKind,
      'SECURITY_ALERT_SINK_KIND_INVALID', 256) : null
  };
  return { ...body, antigenHash: fingerprint(body), promotionEligible: false };
}

function sarifAlert(result, rule, index) {
  const properties = { ...(rule?.properties || {}), ...(result.properties || {}) };
  return canonicalAlert({ source: 'sarif', externalId: result.guid
    || result.fingerprints?.primaryLocationLineHash || `${result.ruleId}:${index}`,
  ruleId: result.ruleId, severity: result.level || properties.securitySeverity,
  message: result.message?.text, location: locationFromSarif(result),
  cwes: properties.cwe || properties.cwes, trustBoundary: properties.trustBoundary,
  sourceKind: properties.sourceKind, sinkKind: properties.sinkKind });
}

function sarifAlerts(document) {
  if (document?.version !== '2.1.0' || !Array.isArray(document.runs)) {
    throw failure('SECURITY_ALERT_SARIF_2_1_REQUIRED');
  }
  const alerts = [];
  for (const run of document.runs) {
    const rules = new Map((run.tool?.driver?.rules || []).map((rule) => [rule.id, rule]));
    for (const result of (run.results || [])) {
      alerts.push(sarifAlert(result, rules.get(result.ruleId), alerts.length));
    }
  }
  return alerts;
}

function structuredAlerts(records) {
  if (!Array.isArray(records)) throw failure('SECURITY_ALERT_LIST_REQUIRED');
  return records.map((record) => canonicalAlert({ ...record,
    source: record.source || 'structured' }));
}

function ingestSecurityAlerts(input, options = {}) {
  const alerts = input?.sarif ? sarifAlerts(input.sarif) : structuredAlerts(input?.alerts);
  const limit = Math.min(MAX_ALERTS, Math.max(1, Number(options.maxAlerts || MAX_ALERTS)));
  if (!alerts.length) throw failure('SECURITY_ALERTS_REQUIRED');
  if (alerts.length > limit) throw failure('SECURITY_ALERT_LIMIT_EXCEEDED');
  const unique = new Map(alerts.map((alert) => [alert.antigenHash, alert]));
  return { schema: 'genos.security-antigen-batch/v1', sourceCount: alerts.length,
    alerts: [...unique.values()].sort((a, b) => a.antigenHash.localeCompare(b.antigenHash)),
    duplicateCount: alerts.length - unique.size, promotionEligible: false };
}

module.exports = { ALERT_SCHEMA, MAX_ALERTS, canonicalAlert, ingestSecurityAlerts };
