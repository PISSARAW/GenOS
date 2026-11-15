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
 * Bornes : 25000 fichiers max, 200KB par fichier, dossiers
 * build exclus. Tout le reste est indexé comme file brut.
 */

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const territoryFiles = require('./territoryFiles');
const path = require('node:path');
const crypto = require('node:crypto');
const graphStore = require('./graphStore');
const invalidation = require('./graphInvalidation');
const jsAdapter = require('./languageAdapters/javascriptAdapter');
const { migrateTerritoryGraph } = require('../../../db/migrations/migrateTerritoryGraph');
const { withTransaction } = require('../../../db');
const { migrateDaemonTerritory } = require('../../../db/migrations/migrateDaemonTerritory');

const MAX_FILES = 25000;
const MAX_FILE_BYTES = 200 * 1024;
const SCAN_BATCH_SIZE = 100;
const SKIP_DIRS = territoryFiles.EXCLUDED;
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

function walkFiles(rootPath, scopePath, maxFiles = MAX_FILES) {
  if (!territoryFiles.validScope(rootPath, scopePath)) return [];
  const gitFiles = listGitFiles(rootPath, scopePath, maxFiles);
  if (gitFiles) return gitFiles;
  const base = path.resolve(rootPath, scopePath.replace(/^[/\\]+/, ''));
  const out = [];
  walkDir(base, { rootPath, out, maxFiles });
  return out;
}

function listGitFiles(rootPath, scopePath, maxFiles) {
  const scope = String(scopePath || '/').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  const args = ['-C', rootPath, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--'];
  if (scope) args.push(scope);
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 16 * 1024 * 1024
    });
    return output.split('\0').filter(Boolean)
      .filter((file) => !file.split('/').some((part) => SKIP_DIRS.has(part)))
      .filter((file) => territoryFiles.safeFile(rootPath, file, scopePath))
      .slice(0, maxFiles + 1);
  } catch (_) {
    return null;
  }
}

function walkDir(current, context) {
  let entries = [];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (context.out.length > context.maxFiles) return;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.genos-')) walkDir(path.join(current, entry.name), context);
    } else if (entry.isFile()) {
      context.out.push(toRelPosix(context.rootPath, path.join(current, entry.name)));
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
  if (!territoryFiles.safeFile(job.rootPath, job.relPath, job.scopePath)) return { indexed: false, reason: 'outside-territory' };
  const abs = path.join(job.rootPath, job.relPath);
  const { content, reason } = readCappedFile(abs);
  if (content === null) return { indexed: false, reason };
  await ensureDirChain(db, job);
  const fileId = await indexFileNode(db, { job, content });
  await linkParentContains(db, { job, fileId });
  if (isJsFile(job.relPath)) await indexJsSemantics(db, { job, content, fileId });
  return { indexed: true, fileId };
}

function readCappedFile(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return { content: null, reason: stat.size > MAX_FILE_BYTES ? 'too-large' : 'not-a-file' };
    return { content: fs.readFileSync(absPath, 'utf8'), reason: null };
  } catch (e) {
    return { content: null, reason: (e && e.code) || 'unreadable' };
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
    const { target, reason } = resolveRelativeImport(batch.job, spec);
    if (!target) continue;
    const targetId = targetFileNodeId(batch.job, target);
    await graphStore.upsertEdge(db, {
      id: graphStore.edgeId({ territoryId: batch.job.territoryId, sourceId: batch.fileId, relation: 'IMPORTS', targetId }),
      territoryId: batch.job.territoryId, sourceId: batch.fileId, relation: 'IMPORTS', targetId
    });
  }
}

function resolveRelativeImport(job, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return { target: null, reason: 'non-relative' };
  const fromDir = path.dirname(path.join(job.rootPath, job.relPath));
  const abs = path.resolve(fromDir, spec);
  const candidates = ['', '.js', '.ts', '.mjs', '.cjs', '.tsx', '.jsx', '/index.js', '/index.ts'];
  for (const suffix of candidates) {
    const hit = pickExistingFile(job, abs + suffix);
    if (hit) return { target: hit, reason: null };
  }
  return { target: null, reason: 'not-found' };
}

function pickExistingFile(job, absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) return null;
  } catch (_) {
    return null;
  }
  const rel = toRelPosix(job.rootPath, absPath);
  return territoryFiles.safeFile(job.rootPath, rel, job.scopePath) ? rel : null;
}

function targetFileNodeId(job, targetRel) {
  const kind = isTestFile(targetRel) ? 'test' : 'file';
  return graphStore.nodeId({ territoryId: job.territoryId, kind, path: targetRel });
}

async function scanTerritory(db, args) {
  if (!territoryFiles.validScope(args.rootPath, args.scopePath)) return { scanned: false, reason: 'invalid-territory-root-or-scope' };
  await migrateDaemonTerritory(db);
  const territory = await db.get('SELECT root_path FROM daemon_territories WHERE id = ?', args.territoryId);
  if (!territory || path.resolve(territory.root_path) !== path.resolve(args.rootPath)) return { scanned: false, reason: 'territory-root-mismatch' };
  await migrateTerritoryGraph(db);
  const maxFiles = args.maxFiles || MAX_FILES;
  const files = walkFiles(args.rootPath, args.scopePath || '/', maxFiles);
  return rebuildGraph(db, { ...args, files, maxFiles });
}

async function rebuildGraph(db, args) {
  const maxFiles = args.maxFiles || MAX_FILES;
  const truncated = args.files.length > maxFiles;
  await resetGraph(db, args.territoryId);
  let indexed = 0;
  const files = args.files.slice(0, maxFiles);
  for (let offset = 0; offset < files.length; offset += SCAN_BATCH_SIZE) {
    const batch = files.slice(offset, offset + SCAN_BATCH_SIZE);
    indexed += await withTransaction(db, () => indexBatch(db, { ...args, files: batch }));
    await new Promise((resolve) => setImmediate(resolve));
  }
  await finishScan(db, { territoryId: args.territoryId, truncated });
  return { scanned: args.files.length, indexed, truncated, maxFiles };
}

async function resetGraph(db, territoryId) {
  await withTransaction(db, async () => {
    await db.run('DELETE FROM territory_graph_edges WHERE territory_id = ?', territoryId);
    await db.run('DELETE FROM territory_graph_nodes WHERE territory_id = ?', territoryId);
    await db.run(`UPDATE daemon_territories SET state = 'SURVEYING', indexed_head_sha = NULL
      WHERE id = ? AND state != 'APOPTOTIC'`, territoryId);
  });
}

async function indexBatch(db, args) {
  let indexed = 0;
  for (const relPath of args.files) {
    const res = await indexFile(db, { territoryId: args.territoryId, rootPath: args.rootPath, scopePath: args.scopePath, relPath });
    if (res.indexed) indexed += 1;
  }
  return indexed;
}

async function finishScan(db, result) {
  if (!result.truncated) return markTerritoryIndexed(db, result.territoryId);
  return db.run(`UPDATE daemon_territories
    SET state = 'DEGRADED', indexed_head_sha = NULL, last_indexed_at = datetime('now')
    WHERE id = ? AND state != 'APOPTOTIC'`, result.territoryId);
}

async function updateFiles(db, args) {
  const territory = await db.get('SELECT root_path, scope_path FROM daemon_territories WHERE id = ?', args.territoryId);
  if (!territory || path.resolve(territory.root_path) !== path.resolve(args.rootPath)) throw new Error('Territory root mismatch');
  if (!(args.files || []).every((file) => territoryFiles.safeFile(args.rootPath, file, territory.scope_path))) throw new Error('File outside territory');
  await invalidation.invalidateFiles(db, { territoryId: args.territoryId, files: args.files });
  let reindexed = 0;
  let skipped = 0;
  for (const relPath of args.files || []) {
    const res = await indexFile(db, { territoryId: args.territoryId, rootPath: args.rootPath, relPath });
    if (res.indexed) {
      reindexed += 1;
    } else {
      skipped += 1;
      await cleanupDanglingIncoming(db, args, relPath);
    }
  }
  await markTerritoryIndexed(db, args.territoryId);
  return { invalidated: (args.files || []).length, reindexed, skipped };
}

async function markTerritoryIndexed(db, territoryId) {
  await migrateDaemonTerritory(db);
  await db.run(
    `UPDATE daemon_territories SET last_indexed_at = datetime('now'), indexed_head_sha = head_sha, state = CASE WHEN state = 'APOPTOTIC' THEN state ELSE 'ACTIVE' END
     WHERE id = ?`,
    territoryId
  );
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
  MAX_FILES,
  SCAN_BATCH_SIZE,
  markTerritoryIndexed
};
