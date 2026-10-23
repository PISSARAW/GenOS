'use strict';

const path = require('path');

function collectWorkspaceContextPaths(root, allowedCommands, readExcerpt, maxFiles, fs = require('fs')) {
  const candidates = [];
  const seen = new Set();
  const add = (relative) => {
    const resolved = path.resolve(root, relative);
    const normalized = path.relative(root, resolved).split(path.sep).join('/');
    if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)
      || normalized.split('/').some((part) => ['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage'].includes(part.toLowerCase()))) return false;
    if (readExcerpt(root, normalized).refused) return false;
    if (!seen.has(normalized)) { seen.add(normalized); candidates.push(normalized); }
    return true;
  };
  const tests = [];
  for (const command of allowedCommands) {
    const match = String(command).match(/(?:^|\s)([A-Za-z0-9_.\\/-]+\.(?:cjs|mjs|js|ts|py|rs))(?:\s|$)/i);
    if (match && add(match[1])) tests.push(match[1].replace(/\\/g, '/'));
  }
  for (const testPath of tests) {
    const test = readExcerpt(root, testPath);
    if (!test.content) continue;
    const imports = /(?:\brequire\s*\(\s*|\bfrom\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
    let match;
    while ((match = imports.exec(test.content)) && candidates.length < maxFiles) {
      const base = path.resolve(root, path.dirname(testPath), match[1]);
      const relative = path.relative(root, base);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
      const possible = [relative, ...['.js', '.cjs', '.mjs', '.ts', '.json'].map((ext) => `${relative}${ext}`),
        ...['index.js', 'index.cjs'].map((file) => path.join(relative, file))];
      possible.find((file) => fs.existsSync(path.resolve(root, file)) && add(file));
    }
  }
  function walk(directory, relative, depth = 0) {
    if (candidates.length >= maxFiles || depth > 10) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (_) { return; }
    for (const entry of entries) {
      if (candidates.length >= maxFiles) break;
      if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'coverage'].includes(entry.name.toLowerCase())) continue;
      const child = relative ? path.join(relative, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(absolute, child, depth + 1);
      else if (entry.isFile()) add(child);
    }
  }
  walk(root, '');
  return candidates.slice(0, maxFiles);
}

module.exports = { collectWorkspaceContextPaths };
