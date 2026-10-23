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
  const anchorPath = detail.match(/Exact edit anchor must occur once in '([^']+)'/)?.[1] || '';
  if (anchorPath) return `The exact edit anchor for '${anchorPath}' was rejected because it did not occur once. Re-read that file in the workspace snapshot; copy a unique anchor exactly or use a full-file replacement only if the complete file is present. Re-evaluate the failing assertion before choosing a source file.`;
  const rejectedPath = detail.match(/Unsafe patch proposal for '([^']+)'/)?.[1] || '';
  return /(^|[\\/])tests?([\\/]|$)/i.test(rejectedPath)
    ? `The rejected path '${rejectedPath}' is a test file and cannot be patched. Keep every test unchanged; repair the production implementation instead.` : '';
}

module.exports = { build };
