'use strict';

const path = require('path');

function collectTargetPaths(options) {
  const candidates = options.candidates || [];
  const targets = new Set();
  for (const testPath of candidates.filter(isTestPath)) {
    const source = options.readExcerpt(options.root, testPath).content || '';
    const imports = importedSymbols(testPath, source, candidates);
    for (const match of source.matchAll(/assert\.(?:throws|rejects)\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
      const target = imports.get(match[1]);
      if (target) targets.add(target);
    }
  }
  return [...targets];
}

function importedSymbols(testPath, source, candidates) {
  const symbols = new Map();
  const imports = /(?:const|let|var)\s*\{\s*([^}]+)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(imports)) {
    const target = resolveCandidate(testPath, match[2], candidates);
    if (!target) continue;
    for (const declaration of match[1].split(',')) {
      const names = declaration.trim().split(/\s*:\s*/);
      const localName = names[1] || names[0];
      if (/^[A-Za-z_$][\w$]*$/.test(localName)) symbols.set(localName, target);
    }
  }
  return symbols;
}

function resolveCandidate(testPath, specifier, candidates) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(testPath), specifier));
  return candidates.find((candidate) => candidate === base || candidate.startsWith(`${base}.`)
    || candidate.startsWith(`${base}/index.`)) || null;
}

function isTestPath(filePath) {
  return /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|(?:\.|\/)(?:test|spec)\.[^.]+$/i.test(filePath);
}

module.exports = { collectTargetPaths };
