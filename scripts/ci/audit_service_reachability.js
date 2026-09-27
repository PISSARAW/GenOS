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

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function audit() {
  const files = sourceFiles(servicesRoot).sort();
  const roots = entryPoints();
  const reachable = reachableFrom(roots);
  const inbound = literalInboundCounts(productionFiles());
  const rows = files.map((file) => ({ service: relative(file),
    staticReachable: reachable.has(file), literalInbound: inbound.get(file) || 0 }));
  const connected = rows.filter((row) => row.staticReachable).length;
  const withoutInbound = rows.filter((row) => row.literalInbound === 0).length;
  return { method: 'literal-relative-imports', caveat: 'Dynamic imports, registration and runtime effects require separate review.',
    entryPoints: roots.map(relative), total: rows.length, staticReachable: connected,
    notStaticallyReachable: rows.length - connected, withoutLiteralInbound: withoutInbound,
    services: rows };
}

if (require.main === module) {
  const result = audit();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    process.stdout.write(`${result.total} services; ${result.staticReachable} reachable by literal imports; `
      + `${result.notStaticallyReachable} require dynamic-path or causal review; `
      + `${result.withoutLiteralInbound} have no literal inbound import.\n`);
    for (const row of result.services.filter((item) => !item.staticReachable).slice(0, 40)) {
      process.stdout.write(`${row.service}\n`);
    }
  }
}

module.exports = { audit, literalImports, reachableFrom };
