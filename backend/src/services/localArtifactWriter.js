'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseReply } = require('./localRuntimeSynthesis');
const writeIpc = require('./runtimeFileWriteIpc');
const { pathAllowed } = require('./ontogenesis/pathAuthority');

const ARTIFACT_TAG_RE = /<ARTIFACT:\s*([^>]+)>([\s\S]*?)<\/ARTIFACT>/gi;
const BRACKET_ARTIFACT_RE = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;

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
  const targetDetails = fs.lstatSync(target, { throwIfNoEntry: false });
  if (targetDetails?.isSymbolicLink()) {
    throw new Error(`Artifact target must not be a symbolic link: ${name}`);
  }
  const bytes = content;
  fs.writeFileSync(target, bytes);
  writeIpc.record(relative, bytes);
  return { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: Buffer.byteLength(bytes) };
}

function extractArtifacts(content) {
  const artifacts = [];
  const text = String(content || '');
  for (const re of [ARTIFACT_TAG_RE, BRACKET_ARTIFACT_RE]) {
    for (const match of text.matchAll(re)) {
      const name = match[1].trim();
      const body = match[2];
      if (!name || body === undefined) continue;
      artifacts.push({ name, content: body });
    }
  }
  return artifacts;
}

function validateArtifactName(entry) {
  if (!entry.name || typeof entry.name !== 'string' || !entry.name.trim()) return ['artifact.name.missing'];
  return [];
}

function validateArtifactContent(entry) {
  if (entry.content === undefined || entry.content === null) return ['artifact.content.missing'];
  if (typeof entry.content !== 'string' || !entry.content.trim()) return ['artifact.content.empty'];
  return [];
}

function validateArtifactPath(entry, state) {
  if (!entry.name) return [];
  const target = path.resolve(state.workspaceRoot, entry.name.trim());
  const relative = path.relative(state.workspaceRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [`artifact.path.escapes:${entry.name}`];
  }
  if (state.allowFileEdits === true && !Array.isArray(state.allowedWritePaths)) {
    return ['artifact.path.scope_required'];
  }
  if (Array.isArray(state.allowedWritePaths)
      && !pathAllowed({ paths: state.allowedWritePaths }, relative)) {
    return [`artifact.path.not_authorized:${entry.name}`];
  }
  return [];
}

function validateArtifactEntry(entry, state) {
  return [
    ...validateArtifactName(entry),
    ...validateArtifactContent(entry),
    ...validateArtifactPath(entry, state)
  ];
}

function writeArtifacts(reply, state) {
  if (!state.allowFileEdits) return { written: [], rejected: [] };
  if (!Array.isArray(state.allowedWritePaths)) throw new Error('artifact.path.scope_required');
  const artifactText = parseReply(reply).artifactText;
  if (typeof artifactText !== 'string' || !artifactText.trim()) {
    return { written: [], rejected: [{ name: null, issues: ['artifact.text.missing_or_empty'] }] };
  }
  const content = artifactText;
  const artifacts = extractArtifacts(content);
  if (!artifacts.length) {
    return { written: [], rejected: [{ name: null, issues: ['artifact.text.no_materialized_files'] }] };
  }
  const written = [];
  const rejected = [];
  require('./localArtifactWriterStages1.js').writeArtifactsStage1({ artifacts, crypto, fs, path, rejected, state, validateArtifactEntry, writeArtifact, written });
  return { written, rejected };
}

module.exports = { writeArtifacts, extractArtifacts, validateArtifactEntry, validateArtifactPath, writeArtifact };
