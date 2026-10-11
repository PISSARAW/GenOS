'use strict';

const writeIpc = require('../src/services/runtimeFileWriteIpc');

function writeArtifact(deps, filepathRaw, codeRaw) {
  const filepath = filepathRaw.trim();
  const code = codeRaw.trim();
  try {
    if (!deps.allowFileEdits) throw new Error(`File edits are not authorized by the GenOS execution policy for: ${filepath}`);
    const absPath = deps.pathLib.resolve(deps.workspaceRoot, filepath);
    const relativePath = deps.pathLib.relative(deps.workspaceRoot, absPath);
    if (relativePath.startsWith('..') || deps.pathLib.isAbsolute(relativePath)) {
      throw new Error(`Artifact path escapes the mission workspace: ${filepath}`);
    }
    deps.fsLib.mkdirSync(deps.pathLib.dirname(absPath), { recursive: true });
    const root = deps.fsLib.realpathSync(deps.workspaceRoot);
    const parent = deps.fsLib.realpathSync(deps.pathLib.dirname(absPath));
    if (parent !== root && !parent.startsWith(`${root}${deps.pathLib.sep}`)) {
      throw new Error(`Artifact path traverses outside the mission workspace: ${filepath}`);
    }
    deps.fsLib.writeFileSync(absPath, code);
    writeIpc.record(relativePath, code);
    return null;
  } catch (e) {
    console.error("Erreur lors de l'ecriture du fichier:", e);
    return e.message;
  }
}

module.exports = { writeArtifact };
