'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseReply } = require('./localRuntimeSynthesis');
const writeIpc = require('./runtimeFileWriteIpc');

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
  const bytes = content.trim();
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
  if (Array.isArray(state.allowedWritePaths)
      && !state.allowedWritePaths.some((prefix) => matchesAllowedPrefix(relative, prefix, state.workspaceRoot))) {
    return [`artifact.path.not_authorized:${entry.name}`];
  }
  return [];
}

function matchesAllowedPrefix(relative, prefix, workspaceRoot) {
  const value = String(prefix || '').trim();
  if (!value) return false;
  const resolved = path.resolve(workspaceRoot, value);
  const allowed = path.relative(workspaceRoot, resolved).replace(/\\/g, '/').replace(/\/+$/, '');
  const target = String(relative).replace(/\\/g, '/');
  if (allowed.startsWith('../') || path.isAbsolute(allowed)) return false;
  return allowed === '' || target === allowed || target.startsWith(`${allowed}/`);
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
  const content = parseReply(reply).artifactText || reply;
  const artifacts = extractArtifacts(content);
  const written = [];
  const rejected = [];
  for (const entry of artifacts) {
    const issues = validateArtifactEntry(entry, state);
    if (issues.length) {
      if (issues.some((issue) => issue.startsWith('artifact.path.escapes:'))) {
        throw new Error(`Artifact path escapes the mission workspace: ${entry.name}`);
      }
      rejected.push({ name: entry.name, issues });
      continue;
    }
    try {
      const record = writeArtifact(state, entry.name, entry.content);
      const target = path.resolve(state.workspaceRoot, entry.name.trim());
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        rejected.push({ name: entry.name, issues: ['artifact.write.missing_on_disk'] });
        continue;
      }
      const onDisk = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (onDisk !== record.sha256) {
        rejected.push({ name: entry.name, issues: ['artifact.write.hash_mismatch'] });
        continue;
      }
      written.push({ ...record, verified: true });
    } catch (error) {
      rejected.push({ name: entry.name, issues: [`artifact.write.error:${error.message}`] });
    }
  }
  return { written, rejected };
}

module.exports = { writeArtifacts, extractArtifacts, validateArtifactEntry, validateArtifactPath, writeArtifact };
