'use strict';

function build(error, mission = {}) {
  const pathHint = allowedPatchPathHint(mission);
  const schemaHint = schemaRetryHint(error);
  return [pathHint, schemaHint].filter(Boolean).join('\n\n');
}

function allowedPatchPathHint(mission) {
  const paths = [...new Set((mission?.allowedPatchPaths || []).filter((item) => typeof item === 'string'))];
  return paths.length
    ? `The only allowed production patch paths are: ${JSON.stringify(paths)}. Choose a path from this list.` : '';
}

function schemaRetryHint(error) {
  if (error.code !== 'WORKER_OUTPUT_SCHEMA_VIOLATION') return '';
  const detail = String(error.workerArtifactDiagnostics?.error || error.message || '');
  const violations = error.workerArtifactDiagnostics?.violations || [];
  if (violations.some((violation) => /additional properties/i.test(String(violation)))) {
    return 'The patch proposal was rejected because it contains keys outside the strict worker schema. A full-replacement patch object must contain exactly "path" and "content"; an edit patch object must contain exactly "path" and "edits". The outer object must contain exactly "format", "patches", "tests", and "evidence". Remove all other keys and prose, then return one valid JSON object.';
  }
  if (violations.some((violation) => /\/content must be string/i.test(String(violation)))) {
    return 'The replacement patch was rejected because `content` must be a JSON string containing the complete file text. Do not put an array, object, or nested patch structure in `content`. Escape quotes and newlines as valid JSON, and return exactly one patch object with string fields `path` and `content`.';
  }
  const anchorPath = detail.match(/Exact edit anchor must occur once in '([^']+)'/)?.[1] || '';
  if (anchorPath) return `The exact edit anchor for '${anchorPath}' was rejected because it did not occur once. That proposal was rejected and the workspace is unchanged; do not copy its anchor from the rejected output or a rolled-back candidate. Re-read the current file in the workspace snapshot. For a small file whose full contents are present, prefer a full-file replacement. Otherwise copy a unique anchor exactly from the current file. Re-evaluate the failing assertion before choosing a source file.`;
  const rejectedPath = detail.match(/Unsafe patch proposal for '([^']+)'/)?.[1] || '';
  return /(^|[\\/])tests?([\\/]|$)/i.test(rejectedPath)
    ? `The rejected path '${rejectedPath}' is a test file and cannot be patched. Keep every test unchanged; repair the production implementation instead.` : '';
}

module.exports = { build };
