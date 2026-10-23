'use strict';

function localArtifactInstruction(allowFileEdits, allowedWritePaths) {
  if (allowFileEdits) {
    const scope = Array.isArray(allowedWritePaths)
      ? (allowedWritePaths.length
        ? ` Only write files under these authorized paths: ${allowedWritePaths.join(', ')}.`
        : ' No file paths are authorized for writing.') : '';
    return `IMPORTANT / ARTIFACTS: For files you create or modify, use [ARTIFACT: path/to/file] and [/ARTIFACT] tags.${scope}`;
  }
  return 'EVIDENCE ARTIFACTS: File writes are forbidden. Do not use [ARTIFACT] tags; return required evidence and specialized JSON directly in your response.';
}

module.exports = { localArtifactInstruction };
