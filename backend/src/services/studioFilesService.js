'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeRelativePath, resolveContainedPathNoSymlinkSync } = require('./pathSafety');
const { createExclusionFilter } = require('./agentWorkspaceLifecycle/copy');
const { isSensitivePath } = require('./agentWorkspaceLifecycle/constants');
const { withRestoreLock } = require('./workspaceSnapshotRestore');
const MAX_BYTES = 256 * 1024;
const excluded = createExclusionFilter();
const invalidName = /[:<>"|?*]|[. ]$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function error(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function allowedPath(relative) {
  const normalized = normalizeRelativePath(relative);
  if (isSensitivePath(normalized)) throw error('FILE_FORBIDDEN', 'Fichier sensible exclu.', 403);
  const blocked = normalized.split('/').some(part => excluded(part) || part.startsWith('.') || invalidName.test(part));
  if (blocked) throw error('FILE_FORBIDDEN', 'Chemin protégé ou invalide.', 403);
  return normalized;
}

function resolveFile(workspace, relative) {
  const normalized = allowedPath(relative);
  if (fs.lstatSync(workspace.path).isSymbolicLink()) throw error('FILE_FORBIDDEN', 'Workspace lié interdit.', 403);
  return { target: resolveContainedPathNoSymlinkSync(workspace.path, normalized), relative: normalized };
}

const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

function readBuffer(target) {
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink > 1) throw error('FILE_FORBIDDEN', 'Fichier lié ou spécial interdit.', 403);
    if (stat.size > MAX_BYTES) throw error('FILE_TOO_LARGE', 'Limite : 256 Kio.', 413);
    const buffer = fs.readFileSync(descriptor);
    if (buffer.length > MAX_BYTES) throw error('FILE_TOO_LARGE', 'Limite : 256 Kio.', 413);
    return buffer;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function utf8(buffer) {
  if (buffer.includes(0)) throw error('BINARY_FILE', 'Seuls les fichiers texte UTF-8 sont éditables.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch (_) { throw error('BINARY_FILE', 'Seuls les fichiers texte UTF-8 sont éditables.'); }
}

function read(workspace, relative) {
  const file = resolveFile(workspace, relative);
  const buffer = readBuffer(file.target);
  return { path: file.relative, content: utf8(buffer), version: digest(buffer), maxBytes: MAX_BYTES };
}

function decodeContent(input) {
  if (typeof input.contentBase64 !== 'string' || input.contentBase64.length > MAX_BYTES * 2) {
    throw error('INVALID_CONTENT', 'Contenu encodé absent ou trop volumineux.');
  }
  const buffer = Buffer.from(input.contentBase64, 'base64');
  if (buffer.toString('base64') !== input.contentBase64) throw error('INVALID_CONTENT', 'Encodage base64 invalide.');
  if (buffer.length > MAX_BYTES) throw error('FILE_TOO_LARGE', 'Limite : 256 Kio.', 413);
  utf8(buffer);
  return buffer;
}

function versionOf(target) {
  try { return digest(readBuffer(target)); }
  catch (issue) { if (issue.code === 'ENOENT') return 'missing'; throw issue; }
}

function writeUnlocked(workspace, input) {
  const file = resolveFile(workspace, input.path);
  const buffer = decodeContent(input);
  if (typeof input.version !== 'string' || versionOf(file.target) !== input.version) {
    throw error('FILE_CONFLICT', 'Le fichier a changé. Rechargez-le avant de sauvegarder.', 409);
  }
  const temporary = path.join(path.dirname(file.target), '.studio-' + crypto.randomUUID());
  const mode = fs.existsSync(file.target) ? fs.statSync(file.target).mode & 0o777 : 0o600;
  try {
    fs.writeFileSync(temporary, buffer, { flag: 'wx', mode });
    resolveFile(workspace, input.path);
    if (versionOf(file.target) !== input.version) throw error('FILE_CONFLICT', 'Modification concurrente détectée.', 409);
    fs.renameSync(temporary, file.target);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  if (versionOf(file.target) !== digest(buffer)) throw error('FILE_CONFLICT', 'Le fichier a changé après écriture.', 409);
  return { path: file.relative, version: digest(buffer), bytes: buffer.length, saved: true };
}

function write(workspace, input) {
  const operation = () => withRestoreLock(workspace.path, () => writeUnlocked(workspace, input));
  return input.db ? require('../db').withTransaction(input.db, operation) : operation();
}

function visit(context, directory) {
  if (context.depth > 16 || context.visited >= 5000) { context.truncated = true; return; }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    context.visited += 1;
    if (context.visited > 5000 || context.files.length >= 250) { context.truncated = true; break; }
    addEntry(context, directory, entry);
  }
}

function addEntry(context, directory, entry) {
  if (entry.isSymbolicLink()) return;
  const target = path.join(directory, entry.name);
  const relative = path.relative(context.root, target).replaceAll(path.sep, '/');
  try { allowedPath(relative); } catch (_) { return; }
  if (entry.isDirectory()) {
    const child = { ...context, depth: context.depth + 1 };
    visit(child, target);
    context.visited = child.visited;
    context.truncated ||= child.truncated;
    return;
  }
  if (entry.isFile()) {
    const stat = fs.statSync(target);
    if (stat.nlink === 1) context.files.push({ path: relative, bytes: stat.size });
  }
}

function list(workspace) {
  if (fs.lstatSync(workspace.path).isSymbolicLink()) throw error('FILE_FORBIDDEN', 'Workspace lié interdit.', 403);
  const context = { root: workspace.path, files: [], visited: 0, depth: 0, truncated: false };
  visit(context, workspace.path);
  return { files: context.files.sort((a, b) => a.path.localeCompare(b.path)), truncated: context.truncated, maxBytes: MAX_BYTES };
}
module.exports = { read, write, list, MAX_BYTES };
