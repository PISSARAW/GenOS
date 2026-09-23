'use strict';

/**
 * JavaScript Adapter — ADR 0034 D5.
 *
 * Extraction déterministe (regex, pas de parser, pas de LLM) :
 * imports relatifs + symboles top-level (function, class, const arrow).
 * Le graphe reste un index approximatif et honnête : ce qui n'est
 * pas reconnu n'est pas inventé, le fichier existe quand même.
 */

const IMPORT_PATTERNS = [
  /(?:import\s+(?:[^'"]+\s+from\s+)?|import\s*\(\s*)['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];

const SYMBOL_PATTERNS = [
  { kind: 'function', re: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm },
  { kind: 'class', re: /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm },
  { kind: 'function', re: /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm },
  { kind: 'function', re: /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm }
];

function parseJavaScript(content) {
  const text = content || '';
  return { imports: extractImports(text), symbols: extractSymbols(text) };
}

function extractImports(text) {
  const found = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      if (isRelativeImport(match[1])) found.push(match[1]);
      match = pattern.exec(text);
    }
  }
  return [...new Set(found)];
}

function isRelativeImport(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function extractSymbols(text) {
  const found = [];
  for (const { kind, re } of SYMBOL_PATTERNS) {
    re.lastIndex = 0;
    let match = re.exec(text);
    while (match) {
      found.push({ name: match[1], kind });
      match = re.exec(text);
    }
  }
  return dedupeSymbols(found);
}

function dedupeSymbols(symbols) {
  const seen = new Set();
  return symbols.filter((s) => {
    const key = `${s.kind}::${s.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { parseJavaScript, extractImports, extractSymbols };
