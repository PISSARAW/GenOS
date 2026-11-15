'use strict';

function workerPolicy(context) {
  return { allowedCommands: context.inherited, allowFileEdits: context.explicitEdits === context.undefined ? /^(1|true)$/i.test(context.String(context.process.env.GENOS_ALLOW_FILE_EDITS || '')) : context.explicitEdits === true, ...(context.Array.isArray(context.firstPresent(context.request.allowed_write_paths, context.request.allowedWritePaths, context.policy.allowedWritePaths)) ? { allowedWritePaths: context.firstPresent(context.request.allowed_write_paths, context.request.allowedWritePaths, context.policy.allowedWritePaths) } : {}), silentUpdates: /^(1|true)$/i.test(context.String(context.process.env.GENOS_SILENT_UPDATES || '')), gqwfV2: context.policy.gqwfV2 === true, gqwfMaterializer: context.policy.gqwfMaterializer };
}

module.exports = { workerPolicy };
