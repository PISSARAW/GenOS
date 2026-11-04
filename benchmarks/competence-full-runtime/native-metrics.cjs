'use strict';

function reason(declaration) {
  if (declaration.requested.some(rule => !rule)) return 'invalid';
  if (declaration.requested.some(rule => rule.reason === 'missing')) return 'missing';
  if (declaration.requested.some(rule => rule.reason === 'ambiguous')) return 'ambiguous';
  return declaration.requested.every(rule => rule.reason === 'answerable') ? 'answerable' : 'invalid';
}

function summarize(rows) {
  const values = rows.flatMap(row => row.nativeDeclarations.map(declaration =>
    ({oracle: row.oracle, declaration, reason: reason(declaration)})));
  const unknown = values.filter(row => !row.oracle.identifiable);
  const recognized = unknown.filter(row => row.reason === row.oracle.reason
    && row.oracle.missing.every(op => row.declaration.requested.some(rule => rule?.op === op && rule.reason === 'missing')));
  return {workerQueryDeclarations: values.length, unknown: unknown.length, recognized: recognized.length,
    recognitionRate: unknown.length ? recognized.length / unknown.length : null,
    answersDespiteNonidentifiability: unknown.filter(row => row.reason === 'answerable').length,
    note: 'Raw model declarations before public coverage and identifiability guards; worker replicates are correlated.'};
}

module.exports = {summarize};
