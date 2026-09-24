'use strict';

const inspector = require('./sourceInspector');

function detect(context) {
  if (context.operation.fieldType !== 'MAP' || context.operation.kind?.key !== 'files') return [];
  const filePath = context.operation.kind.entryKey;
  const files = materializeFiles(context.history);
  const previous = files[filePath];
  const next = context.operation.kind.action === 'delete' ? null : context.operation.kind.value;
  if (hasStaleBase(previous, next)) return [{ type: 'CODE_STALE_WRITE', filePath }];
  if (!previous && !next) return [];
  return changedImports({ filePath, previous, next, files });
}

function hasStaleBase(previous, next) {
  return Boolean(next?.hasExpectedHash && (previous?.hash || null) !== next.expectedHash);
}

function materializeFiles(history) {
  const files = {};
  const operations = history.filter(isFileMutation).sort(compareOperations);
  for (const operation of operations) {
    const path = operation.kind.entryKey;
    if (operation.kind.action === 'delete') delete files[path];
    else files[path] = operation.kind.value;
  }
  return files;
}

function isFileMutation(operation) {
  return operation.fieldType === 'MAP' && operation.kind?.key === 'files';
}

function compareOperations(left, right) {
  return (left.lamport || 0) - (right.lamport || 0)
    || String(left.actorId).localeCompare(String(right.actorId))
    || String(left.opId).localeCompare(String(right.opId));
}

function changedImports(context) {
  const { filePath, previous, next, files } = context;
  const oldSymbols = previous?.symbols || inspector.inspectExports(previous?.content || '');
  const newSymbols = next?.symbols || inspector.inspectExports(next?.content || '');
  const consumers = Object.entries(files).filter(([path]) => path !== filePath);
  const conflicts = [];
  for (const [consumerPath, file] of consumers) {
    const imports = inspector.inspectImports(consumerPath, file.content || '').filter((item) => matchesTarget(item.target, filePath));
    for (const symbol of imports.flatMap((item) => item.symbols)) {
      const change = symbolChange(symbol, oldSymbols, newSymbols);
      if (change) conflicts.push({ type: change, filePath, consumerPath, symbol });
    }
  }
  return conflicts;
}

function matchesTarget(target, filePath) {
  return target === filePath || filePath.startsWith(`${target}.`) || filePath.startsWith(`${target}/index.`);
}

function symbolChange(symbol, oldSymbols, newSymbols) {
  if (!Object.hasOwn(oldSymbols, symbol) && !Object.hasOwn(newSymbols, symbol)) return 'CODE_SYMBOL_UNRESOLVED';
  if (!Object.hasOwn(oldSymbols, symbol)) return null;
  if (!Object.hasOwn(newSymbols, symbol)) return 'CODE_SYMBOL_REMOVED';
  return oldSymbols[symbol] !== newSymbols[symbol] ? 'CODE_INTERFACE_CHANGED' : null;
}

module.exports = { detect };
