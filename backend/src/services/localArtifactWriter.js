'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseReply } = require('./localRuntimeSynthesis');
const writeIpc = require('./runtimeFileWriteIpc');

function writeArtifact(state, name, content) {
  const target = path.resolve(state.workspaceRoot, name.trim());
  const relative = path.relative(state.workspaceRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes the mission workspace: ${name}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const root = fs.realpathSync(state.workspaceRoot);
  const parent = fs.realpathSync(path.dirname(target));
  if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path traverses outside the mission workspace: ${name}`);
  }
  const bytes = content.trim();
  fs.writeFileSync(target, bytes);
  writeIpc.record(relative, bytes);
}

function writeArtifacts(reply, state) {
  if (!state.allowFileEdits) return;
  const content = parseReply(reply).artifactText || reply;
  const pattern = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;
  for (const match of String(content).matchAll(pattern)) writeArtifact(state, match[1], match[2]);
}

module.exports = { writeArtifacts };
