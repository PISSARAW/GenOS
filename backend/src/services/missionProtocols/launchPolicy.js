'use strict';

function workspaceProtocolFields(request = {}) {
  const policy = request.executionPolicy || request.execution_policy || {};
  const enabled = [request.gqwfV2, request.gqwf_v2, policy.gqwfV2].includes(true);
  if (!enabled) return {};
  const materializer = [request.gqwfMaterializer, request.gqwf_materializer, policy.gqwfMaterializer].find(Boolean);
  const readOnly = [request.allow_file_edits, request.allowFileEdits].includes(false);
  return { executionPolicy: { gqwfV2: true, ...(materializer ? { gqwfMaterializer: materializer } : {}) },
    ...(readOnly ? { allow_file_edits: false } : {}) };
}

module.exports = { workspaceProtocolFields };
