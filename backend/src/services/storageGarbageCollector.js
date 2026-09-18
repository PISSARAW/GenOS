'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { completed, failed, simulated } = require('./operationResult');

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function collectHashes(value, output) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.hash === 'string') output.add(value.hash);
  if (typeof value.objectHash === 'string') output.add(value.objectHash);
  if (typeof value.blobHash === 'string') output.add(value.blobHash);
  for (const child of Object.values(value)) collectHashes(child, output);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() && entry.name !== 'refs' ? listFiles(full) : entry.isFile() ? [full] : [];
  });
}

function readRoots(root) {
  const refs = path.join(root, 'refs');
  if (!fs.existsSync(refs)) return new Set();
  const hashes = new Set();
  for (const file of listFiles(refs)) {
    try { collectHashes(JSON.parse(fs.readFileSync(file, 'utf8')), hashes); } catch (_) { throw new Error(`Invalid CAS reference '${file}'.`); }
  }
  return hashes;
}

function casReport(root, marked, candidates) {
  const doomed = candidates.filter((file) => !marked.has(path.basename(file)));
  return { root, marked: marked.size, candidates: candidates.length, unreachable: doomed.map((file) => path.relative(root, file)) };
}

function runCasGc(context = {}) {
  const root = path.resolve(String(context.casRoot || ''));
  if (!context.casRoot) return failed('casRoot is required.');
  if (!fs.existsSync(root)) return completed({ root, marked: 0, candidates: 0, removed: 0, unreachable: [] });
  try {
    const marked = readRoots(root);
    const candidates = listFiles(root);
    const report = casReport(root, marked, candidates);
    if (context.dryRun === true) return simulated({ ...report, removed: 0 });
    for (const relative of report.unreachable) fs.rmSync(path.join(root, relative), { force: true });
    return completed({ ...report, removed: report.unreachable.length });
  } catch (error) {
    return failed(error, { root });
  }
}

function uniqueIds(rows) {
  return new Set(rows.map((row) => String(row.id)));
}

function markReachable(rootIds, edges) {
  const reachable = new Set(rootIds.map(String));
  const queue = [...reachable];
  while (queue.length) {
    const source = queue.shift();
    for (const edge of edges.filter((item) => String(item.source_node_id) === source)) {
      const target = String(edge.target_node_id);
      if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
    }
  }
  return reachable;
}

async function runDagSweep(context = {}) {
  const db = context.db;
  if (!db) return failed('db is required.');
  try {
    const nodes = await db.all('SELECT id FROM lineage_nodes');
    const edges = await db.all('SELECT source_node_id, target_node_id FROM lineage_edges');
    const incoming = new Set(edges.map((edge) => String(edge.target_node_id)));
    const configuredRoots = Array.isArray(context.rootNodeIds) ? context.rootNodeIds : [];
    const roots = configuredRoots.length ? configuredRoots : nodes.filter((node) => !incoming.has(String(node.id))).map((node) => node.id);
    const reachable = markReachable(roots, edges);
    const all = uniqueIds(nodes);
    const unreachable = [...all].filter((id) => !reachable.has(id));
    const report = { roots, totalNodes: all.size, reachableNodes: reachable.size, unreachableNodes: unreachable };
    if (context.prune !== true) return simulated({ ...report, removedNodes: 0 });
    if (unreachable.length) {
      const marks = unreachable.map(() => '?').join(',');
      await db.run(`DELETE FROM lineage_edges WHERE source_node_id IN (${marks}) OR target_node_id IN (${marks})`, ...unreachable, ...unreachable);
      await db.run(`DELETE FROM lineage_nodes WHERE id IN (${marks})`, ...unreachable);
    }
    return completed({ ...report, removedNodes: unreachable.length });
  } catch (error) {
    return failed(error);
  }
}

module.exports = { runCasGc, runDagSweep, hashValue };
