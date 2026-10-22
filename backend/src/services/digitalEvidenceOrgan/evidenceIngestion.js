'use strict';

const {
  SUPPORTED_FORMATS,
  deoError,
  sha256Digest,
  freezeRawBytes,
  requireNonEmptyText,
} = require('./deoContract');
const {
  parseEvtxPayload,
  parseNmapXmlPayload,
  parseHayabusaCsvPayload,
  parseGpoReportPayload,
} = require('./deoFormatParsers');

function mapConftestFailure(failure) {
  return {
    msg: requireNonEmptyText(failure.msg ?? failure.message, 'DEO_CONFTEST_FAILURE_MSG_REQUIRED'),
    rule: failure.metadata?.rule ?? failure.rule ?? 'conftest.violation',
  };
}

function mapConftestWarning(warning) {
  return {
    msg: String(warning.msg ?? warning.message ?? ''),
    rule: warning.metadata?.rule ?? warning.rule ?? 'conftest.warning',
  };
}

function optionalString(val) {
  return val ? String(val) : null;
}

function mapConftestEntry(entry, idx) {
  if (typeof entry.filename !== 'string' || !entry.filename.trim()) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Conftest entry #${idx} missing filename.`);
  }
  if (!Array.isArray(entry.failures)) {
    throw deoError('DEO_INCOMPLETE_EXPORT', `Conftest entry '${entry.filename}' missing failures array.`);
  }
  const warnings = Array.isArray(entry.warnings) ? entry.warnings : [];
  return {
    filename: entry.filename.trim(),
    namespace: String(entry.namespace ?? 'main'),
    host: optionalString(entry.host),
    user: optionalString(entry.user),
    process: optionalString(entry.process),
    timestamp: optionalString(entry.timestamp),
    successes: Number(entry.successes ?? 0),
    failures: entry.failures.map(mapConftestFailure),
    warnings: warnings.map(mapConftestWarning),
  };
}

function extractConftestEntries(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.results)) return parsed.results;
  return null;
}

function parseConftestPayload(rawBytes) {
  const text = rawBytes.toString('utf8').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Corrupted Conftest JSON output: ${err.message}`);
  }
  const entries = extractConftestEntries(parsed);
  if (!entries || entries.length === 0) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'Conftest output must be a non-empty array of file check results.');
  }
  return entries.map(mapConftestEntry);
}

const PARSERS = Object.freeze({
  evtx: parseEvtxPayload,
  nmap_xml: parseNmapXmlPayload,
  hayabusa_csv: parseHayabusaCsvPayload,
  gpo_report: parseGpoReportPayload,
  conftest: parseConftestPayload,
});

function ingestArtifact(artifactInput) {
  if (!artifactInput || typeof artifactInput !== 'object') {
    throw deoError('DEO_ARTIFACT_INPUT_INVALID', 'Artifact input must be an object.');
  }
  const artifactId = requireNonEmptyText(artifactInput.artifactId, 'DEO_ARTIFACT_ID_REQUIRED', 256);
  const format = String(artifactInput.format ?? '').trim().toLowerCase();
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw deoError('DEO_UNSUPPORTED_FORMAT', `Unsupported evidence format '${format}'.`);
  }
  const rawBytes = freezeRawBytes(artifactInput.rawContent);
  if (rawBytes.length === 0) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Artifact '${artifactId}' is empty.`);
  }
  const rawHash = sha256Digest(rawBytes);
  if (artifactInput.expectedHash && artifactInput.expectedHash !== rawHash) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Artifact '${artifactId}' raw hash mismatch against expectedHash.`);
  }
  const parsedRecords = PARSERS[format](rawBytes);
  return Object.freeze({
    artifactId,
    format,
    rawBytes,
    rawByteLength: rawBytes.length,
    rawHash,
    sourceMetadata: artifactInput.sourceMetadata ?? {},
    parsedRecords,
  });
}

module.exports = {
  ingestArtifact,
  parseEvtxPayload,
  parseNmapXmlPayload,
  parseHayabusaCsvPayload,
  parseGpoReportPayload,
  parseConftestPayload,
};
