'use strict';

/**
 * Cartographer v1 — ADR 0034 D5.
 *
 * Construit un graphe territorial durable : directories, files,
 * symbols (JS/TS), arêtes CONTAINS + IMPORTS relatifs résolus.
 *
 * Deux modes, même routine d'indexation (invariant testé) :
 *  - scanTerritory : full walk (cold start, rebuild) ;
 *  - updateFiles : invalidate + re-index des fichiers changés.
 *
 * Bornes : 2000 fichiers max, 200KB par fichier, dossiers
 * build exclus. Tout le reste est indexé comme file brut.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const graphStore = require('./graphStore');
const invalidation = require('./graphInvalidation');
const jsAdapter = require('./languageAdapters/javascriptAdapter');

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 200 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '.genos', 'dist', 'build', 'target', 'coverage', '.next', 'vendor']);
const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);

function isJsFile(relPath) {
  return JS_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function toRelPosix(rootPath, absPath) {
  return path.relative(rootPath, absPath).split(path.sep).join('/');
}

function walkFiles(rootPath, scopePath) {
  const base = path.join(rootPath, scopePath === '/' ? '' : scopePath);
  const out = [];
  walkDir(base, rootPath, out);
  return out.slice(0, MAX_FILES);
}

function walkDir(current, rootPath, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkDir(path.join(current, entry.name), rootPath, out);
    } else if (entry.isFile()) {
      out.push(toRelPosix(rootPath, path.join(current, entry.name)));
    }
  }
}

async function ensureDirChain(db, job) {
  const parts = job.relPath.split('/').slice(0, -1);
  let parentId = null;
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const id = graphStore.nodeId({ territoryId: job.territoryId, kind: 'directory', path: acc });
    await graphStore.upsertNode(db, { id, territoryId: job.territoryId, kind: 'directory', path: acc });
    if (parentId) await linkContains(db, { territoryId: job.territoryId, parentId, childId: id });
    parentId = id;
  }
  return parentId;
}

async function linkContains(db, link) {
  await graphStore.upsertEdge(db, {
    id: graphStore.edgeId({ territoryId: link.territoryId, sourceId: link.parentId, relation: 'CONTAINS', targetId: link.childId }),
    territoryId: link.territoryId,
    sourceId: link.parentId,
    relation: 'CONTAINS',
    targetId: link.childId
  });
}

async function indexFile(db, job) {
  const abs = path.join(job.rootPath, job.relPath);
  const content = readCappedFile(abs);
  if (content === null) return { indexed: false, reason: 'unreadable-or-too-large' };
  await ensureDirChain(db, job);
  const fileId = await indexFileNode(db, { job, content });
  await linkParentContains(db, { job, fileId });
  if (isJsFile(job.relPath)) await indexJsSemantics(db, { job, content, fileId });
  return { indexed: true, fileId };
}

function readCappedFile(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch (_) {
    return null;
  }
}

async function indexFileNode(db, task) {
  const kind = isTestFile(task.job.relPath) ? 'test' : 'file';
  const fileId = graphStore.nodeId({ territoryId: task.job.territoryId, kind, path: task.job.relPath });
  await graphStore.upsertNode(db, {
    id: fileId, territoryId: task.job.territoryId, kind, path: task.job.relPath, hash: hashContent(task.content)
  });
  return fileId;
}

function isTestFile(relPath) {
  const base = relPath.split('/').pop() || '';
  return base.includes('.test.') || base.includes('.spec.') || base.startsWith('test_');
}

async function linkParentContains(db, task) {
  const parts = task.job.relPath.split('/').slice(0, -1);
  if (parts.length === 0) return;
  const parentId = graphStore.nodeId({ territoryId: task.job.territoryId, kind: 'directory', path: parts.join('/') });
  await linkContains(db, { territoryId: task.job.territoryId, parentId, childId: task.fileId });
}

async function indexJsSemantics(db, task) {
  const parsed = jsAdapter.parseJavaScript(task.content);
  await indexSymbols(db, { job: task.job, symbols: parsed.symbols, fileId: task.fileId });
  await indexImports(db, { job: task.job, imports: parsed.imports, fileId: task.fileId });
}

async function indexSymbols(db, batch) {
  for (const symbol of batch.symbols) {
    const symbolId = graphStore.nodeId({ territoryId: batch.job.territoryId, kind: 'symbol', path: batch.job.relPath, name: symbol.name });
    await graphStore.upsertNode(db, {
      id: symbolId, territoryId: batch.job.territoryId, kind: 'symbol',
      path: batch.job.relPath, name: symbol.name, symbolKind: symbol.kind
    });
    await linkContains(db, { territoryId: batch.job.territoryId, parentId: batch.fileId, childId: symbolId });
  }
}

async function indexImports(db, batch) {
  for (const spec of batch.imports) {
    const target = resolveRelativeImport(batch.job, spec);
    if (!target) continue;
    const targetId = targetFileNodeId(batch.job, target);
    await graphStore.upsertEdge(db, {
      id: graphStore.edgeId({ territoryId: batch.job.territoryId, sourceId: batch.fileId, relation: 'IMPORTS', targetId }),
      territoryId: batch.job.territoryId, sourceId: batch.fileId, relation: 'IMPORTS', targetId
    });
  }
}

function resolveRelativeImport(job, spec) {
  const fromDir = path.dirname(path.join(job.rootPath, job.relPath));
  const abs = path.resolve(fromDir, spec);
  const candidates = ['', '.js', '.ts', '.mjs', '.cjs', '.tsx', '.jsx', '/index.js', '/index.ts'];
  for (const suffix of candidates) {
    const hit = pickExistingFile(job, abs + suffix);
    if (hit) return hit;
  }
  return null;
}

function pickExistingFile(job, absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) return null;
  } catch (_) {
    return null;
  }
  const rel = toRelPosix(job.rootPath, absPath);
  return rel.startsWith('..') ? null : rel;
}

function targetFileNodeId(job, targetRel) {
  const kind = isTestFile(targetRel) ? 'test' : 'file';
  return graphStore.nodeId({ territoryId: job.territoryId, kind, path: targetRel });
}

async function scanTerritory(db, args) {
  const files = walkFiles(args.rootPath, args.scopePath || '/');
  let indexed = 0;
  for (const relPath of files) {
    const res = await indexFile(db, { territoryId: args.territoryId, rootPath: args.rootPath, relPath });
    if (res.indexed) indexed += 1;
  }
  return { scanned: files.length, indexed };
}

async function updateFiles(db, args) {
  await invalidation.invalidateFiles(db, { territoryId: args.territoryId, files: args.files });
  let reindexed = 0;
  for (const relPath of args.files || []) {
    const res = await indexFile(db, { territoryId: args.territoryId, rootPath: args.rootPath, relPath });
    if (res.indexed) {
      reindexed += 1;
    } else {
      await cleanupDanglingIncoming(db, args, relPath);
    }
  }
  return { invalidated: (args.files || []).length, reindexed };
}

async function cleanupDanglingIncoming(db, args, relPath) {
  const ids = ['file', 'test'].map((kind) => graphStore.nodeId({ territoryId: args.territoryId, kind, path: relPath }));
  await graphStore.deleteIncomingEdges(db, { territoryId: args.territoryId, nodeIds: ids });
}

module.exports = {
  scanTerritory,
  updateFiles,
  indexFile,
  walkFiles,
  isJsFile,
  MAX_FILES
};
