'use strict';

const {
  DEO_OBSERVATION_SCHEMA,
  deoError,
  canonicalDigest,
  parseIsoTimestamp,
} = require('./deoContract');
const { canonicalValue } = require('../stateFingerprint');
const { computeExtractionFidelity } = require('./deoBinaryEvtxAndGpoZaurr');

const KNOWN_EVTX_EVENT_IDS = Object.freeze({
  1: { category: 'process_creation', severity: 'medium', label: 'Sysmon Process Creation' },
  3: { category: 'network_connection', severity: 'low', label: 'Sysmon Network Connection' },
  22: { category: 'dns_query', severity: 'low', label: 'Sysmon DNS Query' },
  1102: { category: 'audit_log_cleared', severity: 'critical', label: 'Audit Log Cleared' },
  4624: { category: 'authentication_success', severity: 'info', label: 'Account Logon Success' },
  4625: { category: 'authentication_failure', severity: 'medium', label: 'Account Logon Failure' },
  4662: { category: 'directory_service_access', severity: 'high', label: 'Operation Performed on Active Directory Object' },
  4672: { category: 'privilege_escalation', severity: 'high', label: 'Special Privileges Assigned' },
  4688: { category: 'process_creation', severity: 'low', label: 'Process Creation' },
  4697: { category: 'service_installation', severity: 'high', label: 'Service Installed' },
  4698: { category: 'scheduled_task', severity: 'high', label: 'Scheduled Task Created' },
  4720: { category: 'account_management', severity: 'high', label: 'User Account Created' },
  4732: { category: 'group_modification', severity: 'high', label: 'Member Added to Security Group' },
  5140: { category: 'network_share_access', severity: 'medium', label: 'Network Share Object Accessed' },
  5145: { category: 'network_share_access', severity: 'medium', label: 'Network Share Object Checked' },
  5156: { category: 'network_connection', severity: 'low', label: 'Windows Filtering Platform Permitted Connection' },
  7045: { category: 'service_installation', severity: 'high', label: 'New Service Installed' },
});

const KNOWN_HAYABUSA_LEVELS = new Set(['informational', 'info', 'low', 'med', 'medium', 'high', 'crit', 'critical']);
const LEVEL_MAP = Object.freeze({ crit: 'critical', med: 'medium', informational: 'info' });

function computeEventSemanticHash(artifact, rawObs, ts) {
  return canonicalDigest({
    schema: DEO_OBSERVATION_SCHEMA,
    sourceFormat: artifact.format,
    observationType: rawObs.observationType,
    category: rawObs.category,
    severity: rawObs.severity,
    occurredAt: ts.iso,
    epochMs: ts.epochMs,
    subject: {
      host: rawObs.host ? String(rawObs.host).trim().toLowerCase() : null,
      user: rawObs.user ? String(rawObs.user).trim().toLowerCase() : null,
      process: rawObs.process ? String(rawObs.process).trim() : null,
    },
    attributes: rawObs.attributes ?? {},
    epistemicType: 'observational',
    promotionEligible: false,
  });
}

function buildObservation(artifact, rawObs, recordIndex) {
  const ts = parseIsoTimestamp(rawObs.timestamp, 'DEO_OBSERVATION_TIMESTAMP_INVALID');
  const observationHash = computeEventSemanticHash(artifact, rawObs, ts);
  const body = canonicalValue({
    schema: DEO_OBSERVATION_SCHEMA,
    artifactId: artifact.artifactId,
    sourceFormat: artifact.format,
    recordIndex,
    observationType: rawObs.observationType,
    category: rawObs.category,
    severity: rawObs.severity,
    occurredAt: ts.iso,
    epochMs: ts.epochMs,
    subject: {
      host: rawObs.host ? String(rawObs.host).trim().toLowerCase() : null,
      user: rawObs.user ? String(rawObs.user).trim().toLowerCase() : null,
      process: rawObs.process ? String(rawObs.process).trim() : null,
    },
    attributes: rawObs.attributes ?? {},
    epistemicType: 'observational',
    promotionEligible: false,
  });
  return Object.freeze({
    ...body,
    observationId: `obs:${observationHash.slice(7, 23)}`,
    observationHash,
  });
}

function normalizeEvtxRecord(artifact, record, index) {
  const mapping = KNOWN_EVTX_EVENT_IDS[record.eventId];
  if (!mapping) {
    throw deoError(
      'DEO_UNKNOWN_EVENT',
      `Unknown or uncatalogued EVTX EventID ${record.eventId} in artifact '${artifact.artifactId}'.`,
      { eventId: record.eventId, artifactId: artifact.artifactId },
    );
  }
  return buildObservation(artifact, {
    observationType: 'windows_event',
    category: mapping.category,
    severity: mapping.severity,
    timestamp: record.timestamp,
    host: record.host,
    user: record.user,
    process: record.process,
    attributes: {
      eventId: record.eventId,
      recordId: record.recordId,
      channel: record.channel,
      label: mapping.label,
      eventData: record.data ?? {},
    },
  }, index);
}

function normalizeNmapRecord(artifact, record, index) {
  if (!Array.isArray(record.ports) || record.ports.length === 0) {
    throw deoError('DEO_UNKNOWN_EVENT', `Nmap host '${record.host}' has no observable port states.`);
  }
  const openPorts = record.ports.filter((p) => p.state === 'open');
  const processServices = openPorts.map((p) => p.service).filter(Boolean).join(',');
  return buildObservation(artifact, {
    observationType: 'network_service_exposure',
    category: 'network_reconnaissance',
    severity: openPorts.length > 0 ? 'medium' : 'info',
    timestamp: record.timestamp,
    host: record.host,
    user: null,
    process: processServices || null,
    attributes: {
      address: record.address,
      ports: record.ports,
      openPortCount: openPorts.length,
    },
  }, index);
}

function normalizeHayabusaRecord(artifact, record, index) {
  const levelKey = String(record.level ?? '').trim().toLowerCase();
  if (!KNOWN_HAYABUSA_LEVELS.has(levelKey)) {
    throw deoError(
      'DEO_UNKNOWN_EVENT',
      `Unknown Hayabusa alert level '${record.level}' in artifact '${artifact.artifactId}'.`,
    );
  }
  if (!Number.isInteger(record.eventId) || record.eventId <= 0) {
    throw deoError('DEO_UNKNOWN_EVENT', `Invalid EventID in Hayabusa row #${record.rowNumber}.`);
  }
  return buildObservation(artifact, {
    observationType: 'sigma_timeline_alert',
    category: 'threat_detection',
    severity: LEVEL_MAP[levelKey] ?? levelKey,
    timestamp: record.timestamp,
    host: record.host,
    user: record.user,
    process: record.process,
    attributes: {
      ruleTitle: record.ruleTitle,
      eventId: record.eventId,
      channel: record.channel,
      details: record.details,
    },
  }, index);
}

function normalizeGpoRecord(artifact, record, index) {
  const stateLower = String(record.state ?? '').trim().toLowerCase();
  if (!['enabled', 'disabled', 'configured', 'not_configured', 'audit_only'].includes(stateLower)) {
    throw deoError('DEO_UNKNOWN_EVENT', `Unknown GPO policy state '${record.state}'.`);
  }
  return buildObservation(artifact, {
    observationType: 'directory_policy_posture',
    category: 'configuration_governance',
    severity: stateLower === 'disabled' ? 'high' : 'info',
    timestamp: record.timestamp,
    host: record.host,
    user: record.user,
    process: null,
    attributes: {
      gpoName: record.gpoName,
      domain: record.domain,
      policyPath: record.policyPath,
      settingName: record.settingName,
      state: stateLower,
    },
  }, index);
}

function resolveConftestSeverity(record) {
  if (record.failures.length > 0) return 'high';
  if (record.warnings.length > 0) return 'low';
  return 'info';
}

function normalizeConftestRecord(artifact, record, index) {
  const meta = artifact.sourceMetadata ?? {};
  const timestamp = record.timestamp ?? meta.collectedAt;
  if (!timestamp) {
    throw deoError('DEO_OBSERVATION_TIMESTAMP_INVALID', 'Conftest record requires timestamp or sourceMetadata.collectedAt.');
  }
  return buildObservation(artifact, {
    observationType: 'policy_as_code_evaluation',
    category: 'compliance_verification',
    severity: resolveConftestSeverity(record),
    timestamp,
    host: record.host ?? meta.host ?? null,
    user: record.user ?? meta.user ?? null,
    process: record.process ?? 'conftest',
    attributes: {
      filename: record.filename,
      namespace: record.namespace,
      successes: record.successes,
      failures: record.failures,
      warnings: record.warnings,
      verdict: record.failures.length > 0 ? 'fail' : 'pass',
    },
  }, index);
}

const NORMALIZERS = Object.freeze({
  evtx: normalizeEvtxRecord,
  nmap_xml: normalizeNmapRecord,
  hayabusa_csv: normalizeHayabusaRecord,
  gpo_report: normalizeGpoRecord,
  conftest: normalizeConftestRecord,
});

function normalizeIngestedArtifact(ingestedArtifact) {
  const normalizer = NORMALIZERS[ingestedArtifact?.format];
  if (!normalizer) {
    throw deoError('DEO_UNSUPPORTED_FORMAT', `Cannot normalize format '${ingestedArtifact?.format}'.`);
  }
  const rawObservations = ingestedArtifact.parsedRecords.map((rec, idx) => normalizer(ingestedArtifact, rec, idx));
  const uniqueByHash = new Map();
  const duplicateIds = [];
  for (const obs of rawObservations) {
    if (uniqueByHash.has(obs.observationHash)) {
      duplicateIds.push(obs.observationId);
    } else {
      uniqueByHash.set(obs.observationHash, obs);
    }
  }
  return Object.freeze({
    artifactId: ingestedArtifact.artifactId,
    format: ingestedArtifact.format,
    observations: [...uniqueByHash.values()],
    duplicateCount: duplicateIds.length,
    duplicateObservationIds: duplicateIds,
    extractionFidelity: computeExtractionFidelity(
      ingestedArtifact.parsedRecords,
      uniqueByHash.size,
      duplicateIds.length
    ),
  });
}

module.exports = {
  KNOWN_EVTX_EVENT_IDS,
  normalizeIngestedArtifact,
};
