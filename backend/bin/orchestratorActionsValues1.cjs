'use strict';

function workerPolicyValue1(__genosValueScope1) {
  return { allowedCommands: __genosValueScope1.inherited, allowFileEdits: __genosValueScope1.explicitEdits === __genosValueScope1.undefined ? /^(1|true)$/i.test((0, __genosValueScope1.String)(__genosValueScope1.process.env.GENOS_ALLOW_FILE_EDITS || '')) : __genosValueScope1.explicitEdits === true, ...(__genosValueScope1.Array.isArray((0, __genosValueScope1.firstPresent)(__genosValueScope1.request.allowed_write_paths, __genosValueScope1.request.allowedWritePaths, __genosValueScope1.policy.allowedWritePaths)) ? { allowedWritePaths: (0, __genosValueScope1.firstPresent)(__genosValueScope1.request.allowed_write_paths, __genosValueScope1.request.allowedWritePaths, __genosValueScope1.policy.allowedWritePaths) } : {}), silentUpdates: /^(1|true)$/i.test((0, __genosValueScope1.String)(__genosValueScope1.process.env.GENOS_SILENT_UPDATES || '')), gqwfV2: __genosValueScope1.policy.gqwfV2 === true, gqwfMaterializer: __genosValueScope1.policy.gqwfMaterializer };
}

module.exports = { workerPolicyValue1 };
