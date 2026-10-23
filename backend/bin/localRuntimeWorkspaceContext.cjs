'use strict';

const path = require('path');

const LOCAL_WORKER_FILE_BUDGET = { maxFileBytes: 32768, maxTotalBytes: 131072, maxFiles: 12 };
function buildWorkspaceContext(workspaceRoot) {
  const fs = require('fs');
  const root = path.resolve(workspaceRoot || process.cwd());
  const projectName = process.env.GRIOT_PROJECT_NAME || path.basename(root);
  const candidates = listWorkspaceFiles(fs, root, LOCAL_WORKER_FILE_BUDGET.maxFiles);
  const names = candidates.join(', ') || '(aucun)';
  const bootstrapHint = candidates.some(name => hasRootImplementationFile(fs, root, name)) ? ''
    : '\n[WORKSPACE INITIALIZATION] No implementation source files were found. For a create/build task, scaffold from scratch using the mission requirements; an empty starter workspace is not a blocker. For modification or review tasks, report the specific missing source instead of inventing it.';
  let text = `[CONTEXTE DU WORKSPACE ACTIF : Projet "${projectName}"]\nFichiers du workspace : ${names}${bootstrapHint}\n\n`;
  const fileHashes = {};
  let total = 0;
  for (const name of candidates) {
    const excerpt = readWorkspaceFileExcerpt(root, name);
    if (excerpt.sha256) fileHashes[excerpt.path] = excerpt.sha256;
    text += formatExcerpt(excerpt, total >= LOCAL_WORKER_FILE_BUDGET.maxTotalBytes);
    if (!excerpt.refused && total < LOCAL_WORKER_FILE_BUDGET.maxTotalBytes) total += excerpt.bytes;
  }
  return { text, fileHashes };
}
function listWorkspaceFiles(fs, root, limit) {
  const skipped = new Set(['.git', '.genos', 'node_modules', 'dist', 'build', 'coverage', 'target']);
  const files = [];
  function visit(directory, depth) {
    if (depth > 4 || files.length >= limit) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= limit) break;
      if (entry.name.startsWith('.') || skipped.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile()) files.push(path.relative(root, absolute));
    }
  }
  visit(root, 0);
  return files;
}
function hasRootImplementationFile(fs, root, name) {
  if (!/\.(?:html?|css|[cm]?js|jsx?|tsx?|py|rs|go|java|cs|rb|php)$/i.test(name)) return false;
  try { return fs.lstatSync(path.join(root, name)).isFile(); } catch { return false; }
}

function formatExcerpt(excerpt, overBudget) {
  const refused = excerpt.refused || (overBudget ? 'budget_exceeded' : '');
  if (refused) return `[FICHIER ${excerpt.path} : REFUS ${refused}, sha256=${excerpt.sha256 || 'inconnu'}]\n`;
  return `[FICHIER ${excerpt.path} | sha256=${excerpt.sha256}]\n${excerpt.content}\n[/FICHIER]\n`;
}
function readWorkspaceFileExcerpt(workspaceRoot, relativePath) {
  const fs = require('fs');
  const name = String(relativePath || '');
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, name.trim());
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return { path: name, refused: 'path_escape' };
  let stats;
  try {
    stats = fs.lstatSync(target);
  } catch (e) { return { path: relative, refused: 'unreadable' }; }
  if (!stats.isFile() || stats.isSymbolicLink()) return { path: relative, refused: 'not_a_file' };
  const bounded = readBoundedFile(fs, target, LOCAL_WORKER_FILE_BUDGET.maxFileBytes);
  if (bounded.bytes > LOCAL_WORKER_FILE_BUDGET.maxFileBytes) return { path: relative, sha256: bounded.sha256, bytes: bounded.bytes, refused: 'too_large' };
  return { path: relative, sha256: bounded.sha256, bytes: bounded.bytes, content: bounded.content };
}
function readBoundedFile(fs, target, cap) {
  const crypto = require('crypto');
  const fd = fs.openSync(target, 'r');
  const hash = crypto.createHash('sha256');
  const chunks = [];
  let bytes = 0;
  try {
    const buf = Buffer.alloc(65536);
    for (;;) {
      const read = fs.readSync(fd, buf, 0, buf.length, null);
      if (read <= 0) break;
      hash.update(buf.subarray(0, read));
      bytes += read;
      if (bytes <= cap) chunks.push(Buffer.from(buf.subarray(0, read)));
    }
  } finally { fs.closeSync(fd); }
  return { bytes, sha256: hash.digest('hex'), content: bytes <= cap ? Buffer.concat(chunks).toString('utf8') : null };
}
module.exports = { buildWorkspaceContext, readWorkspaceFileExcerpt };
