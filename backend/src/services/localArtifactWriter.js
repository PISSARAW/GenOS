'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseReply } = require('./localRuntimeSynthesis');

function writeArtifact(state, name, content) {
  const target = path.resolve(state.workspaceRoot, name.trim());
  const relative = path.relative(state.workspaceRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes the mission workspace: ${name}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.trim());
}

function writeArtifacts(reply, state) {
  if (!state.allowFileEdits) return;
  const content = parseReply(reply).artifactText || reply;
  const pattern = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;
  for (const match of String(content).matchAll(pattern)) writeArtifact(state, match[1], match[2]);
}

module.exports = { writeArtifacts };
