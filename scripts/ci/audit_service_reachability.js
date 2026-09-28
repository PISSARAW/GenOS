'use strict';

// Inventory every Node service and trace literal imports from production entry points.
// Reachability is necessary for wiring, but cannot prove decision or action effects.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const servicesRoot = path.join(root, 'backend/src/services');
const extensions = ['.js', '.cjs', '.mjs'];
const importPattern = /(?:require\s*\(\s*|from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g;

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [child] : [];
  });
}

function resolveImport(origin, request) {
  const base = path.resolve(path.dirname(origin), request);
  const candidates = [base, ...extensions.map((ext) => base + ext),
    ...extensions.map((ext) => path.join(base, 'index' + ext))];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function literalImports(file) {
  const content = fs.readFileSync(file, 'utf8');
  const imports = [];
  for (const match of content.matchAll(importPattern)) {
    const resolved = resolveImport(file, match[1]);
    if (resolved) imports.push(resolved);
  }
  return imports;
}

function entryPoints() {
  return [path.join(root, 'backend/server.js'), path.join(root, 'mcp/index.js'),
    ...sourceFiles(path.join(root, 'backend/bin'))].filter(fs.existsSync);
}

function productionFiles() {
  return [path.join(root, 'backend/server.js'), path.join(root, 'mcp/index.js'),
    ...sourceFiles(path.join(root, 'backend/src')),
    ...sourceFiles(path.join(root, 'backend/bin'))].filter(fs.existsSync);
}

function literalInboundCounts(files) {
  const counts = new Map();
  for (const file of files) {
    for (const imported of new Set(literalImports(file))) {
      counts.set(imported, (counts.get(imported) || 0) + 1);
    }
  }
  return counts;
}

function reachableFrom(roots) {
  const visited = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    queue.push(...literalImports(file).filter((child) => !visited.has(child)));
  }
  return visited;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function dynamicSignals(content, rel) {
  const signals = [];
  if (/register\s*\(|serviceRegistry|toolRegistry|getHandlers\s*\(|container\s*\.\s*(get|resolve)\s*\(/.test(content)) signals.push('registry');
  if (/import\s*\(|require\s*\(\s*[`'"][^'"`]*\$\{|require\s*\(\s*[a-zA-Z_$]/.test(content)) signals.push('computed-import');
  if (/registerPlugin|loadPlugin|plugin\s*(register|loader)/i.test(content)) signals.push('plugin');
  if (/process\.argv|commander|yargs|backend\/bin/.test(content) || rel.includes('bin/') || rel.includes('/cli/')) signals.push('cli-entry');
  if (/setInterval|node-cron|cron\s*\.\s*schedule|agenda|schedule\s*\(/.test(content)) signals.push('scheduled');
  if (/GENOS_MCP_LEASE|GENOS_ORCHESTRATOR_BRIDGE|GENOS_MCP_COMMAND/.test(content)) signals.push('config-wiring');
  return signals;
}

function testInboundCounts() {
  const testDirs = [path.join(root, 'backend/tests'), path.join(root, 'backend/test'), path.join(root, 'mcp')];
  const files = testDirs.flatMap(sourceFiles).filter(fs.existsSync);
  return literalInboundCounts(files);
}

function classifyRow(row, context, testInbound) {
  if (row.staticReachable) return 'static';
  if (context.signals.length) return 'dynamic-wiring';
  if (context.rel.includes('backend/bin/') || context.rel.includes('/cli/')) return 'external-entry';
  if ((testInbound.get(row.file) || 0) > 0) return 'test-only';
  return 'unresolved';
}

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] || 0) + 1;
  return counts;
}

function audit() {
  const files = sourceFiles(servicesRoot).sort();
  const roots = entryPoints();
  const reachable = reachableFrom(roots);
  const inbound = literalInboundCounts(productionFiles());
  const testInbound = testInboundCounts();
  const rows = files.map((file) => {
    const rel = relative(file);
    const base = { file, service: rel, staticReachable: reachable.has(file), literalInbound: inbound.get(file) || 0 };
    const signals = dynamicSignals(readText(file), rel);
    return { ...base, signals, category: classifyRow(base, { rel, signals }, testInbound) };
  });
  const connected = rows.filter((row) => row.staticReachable).length;
  const withoutInbound = rows.filter((row) => row.literalInbound === 0).length;
  const publicRows = rows.map((row) => ({ service: row.service, staticReachable: row.staticReachable, literalInbound: row.literalInbound, category: row.category, signals: row.signals }));
  return { method: 'literal-relative-imports+dynamic-signals', caveat: 'Static reachability is not proof of use; dynamic signals need causal review before any deletion.',
    entryPoints: roots.map(relative), total: rows.length, staticReachable: connected,
    notStaticallyReachable: rows.length - connected, withoutLiteralInbound: withoutInbound,
    categories: countBy(publicRows, 'category'), services: publicRows };
}

if (require.main === module) {
  const result = audit();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    process.stdout.write(`${result.total} services; ${result.staticReachable} reachable by literal imports; `
      + `${result.notStaticallyReachable} require dynamic-path or causal review; `
      + `${result.withoutLiteralInbound} have no literal inbound import.\n`);
    process.stdout.write(`categories: ${JSON.stringify(result.categories)}\n`);
    for (const row of result.services.filter((item) => item.category === 'unresolved').slice(0, 40)) {
      process.stdout.write(`unresolved: ${row.service}\n`);
    }
  }
}

module.exports = { audit, literalImports, reachableFrom };
