'use strict';

function localArtifactInstruction(allowFileEdits) {
  if (allowFileEdits) {
    return 'IMPORTANT / ARTIFACTS: For files you create or modify, use [ARTIFACT: path/to/file] and [/ARTIFACT] tags.';
  }
  return 'EVIDENCE ARTIFACTS: File writes are forbidden. Do not use [ARTIFACT] tags; return required evidence and specialized JSON directly in your response.';
}

module.exports = { localArtifactInstruction };
