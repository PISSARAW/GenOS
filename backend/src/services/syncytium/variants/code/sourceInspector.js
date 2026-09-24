'use strict';

const path = require('node:path').posix;

const EXPORT_PATTERN = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*\(([^)]*)\))?/g;
const IMPORT_PATTERN = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

function inspect(filePath, content) {
  const symbols = inspectExports(content);
  const dependencies = inspectImports(filePath, content);
  return {
    filePath,
    content,
    hash: require('node:crypto').createHash('sha256').update(content).digest('hex'),
    astSummary: { exportDeclarations: Object.keys(symbols), importDeclarations: dependencies.length },
    symbols,
    dependencies
  };
}

function inspectExports(content) {
  const symbols = {};
  for (const match of content.matchAll(EXPORT_PATTERN)) {
    symbols[match[1]] = match[2] === undefined ? null : normalizeSignature(match[2]);
  }
  return symbols;
}

function inspectImports(filePath, content) {
  const imports = [];
  for (const match of content.matchAll(IMPORT_PATTERN)) {
    imports.push({
      source: match[2],
      target: resolveTarget(filePath, match[2]),
      symbols: match[1].split(',').map((value) => value.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    });
  }
  return imports;
}

function resolveTarget(filePath, source) {
  if (!source.startsWith('.')) return source;
  return path.normalize(path.join(path.dirname(filePath), source)).replace(/^\.\//, '');
}

function normalizeSignature(signature) {
  return signature.split(',').map((item) => item.trim()).filter(Boolean).join(',');
}

module.exports = { inspect, inspectExports, inspectImports, resolveTarget };
