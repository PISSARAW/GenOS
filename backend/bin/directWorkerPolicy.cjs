'use strict';
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');

function firstPresent(...values) { return values.find(value => value !== undefined && value !== null); }

function commands(request, policy) {
  const explicit = firstPresent(request.allowed_commands, request.allowedCommands, policy.allowedCommands);
  if (explicit !== undefined) return normalizeAllowedCommands(explicit) || [];
  try { return normalizeAllowedCommands(JSON.parse(process.env.GENOS_ALLOWED_COMMANDS_JSON || '[]')) || []; }
  catch { return []; }
}

function writePaths(request, policy) {
  const paths = firstPresent(request.allowed_write_paths, request.allowedWritePaths, policy.allowedWritePaths);
  return Array.isArray(paths) ? { allowedWritePaths: paths } : {};
}

function workerPolicy(request = {}) {
  const policy = request.executionPolicy || {};
  const edits = firstPresent(request.allow_file_edits, request.allowFileEdits, policy.allowFileEdits);
  return { allowedCommands: commands(request, policy),
    allowFileEdits: edits === undefined ? /^(1|true)$/i.test(String(process.env.GENOS_ALLOW_FILE_EDITS || '')) : edits === true,
    ...writePaths(request, policy),
    silentUpdates: /^(1|true)$/i.test(String(process.env.GENOS_SILENT_UPDATES || '')),
    gqwfV2: policy.gqwfV2 === true, gqwfMaterializer: policy.gqwfMaterializer };
}
module.exports = { workerPolicy };
