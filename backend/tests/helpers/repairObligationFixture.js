'use strict';

const { createHash } = require('node:crypto');
const hash = text => createHash('sha256').update(text).digest('hex');
const CANDIDATE = '((a % b) + b) % b';
const BASELINE = 'a % b';

function fixture() {
  const suite = { version: 1, obligations: [
    { id: 'negative', mode: 'regression', statement: 'Negative dividends produce the declared nonnegative remainder.',
      cases: [{ input: { a: -1, b: 4 }, expected: 3 }, { input: { a: -5, b: 3 }, expected: 1 }] },
    { id: 'positive', mode: 'preservation', statement: 'Positive dividend results are preserved.',
      cases: [{ input: { a: 5, b: 4 }, expected: 1 }, { input: { a: 7, b: 3 }, expected: 1 }] }
  ] };
  const files = { 'candidate.gexpr': CANDIDATE, 'baseline.gexpr': BASELINE, 'obligations.json': JSON.stringify(suite) };
  const contract = { version: 1, kind: 'code_repair_obligations',
    artifactPath: 'candidate.gexpr', baselinePath: 'baseline.gexpr', suitePath: 'obligations.json',
    obligationIds: ['negative', 'positive'],
    mutants: [
      { id: 'constant-zero', expression: '0', obligationIds: ['negative', 'positive'] },
      { id: 'wrong-boundary', expression: 'b', obligationIds: ['negative', 'positive'] }
    ], sources: Object.entries(files).map(([path, content]) => ({ path, sha256: hash(content),
      ...(path === 'candidate.gexpr' ? { mutable: true } : {}) })) };
  return { files, contract, suite };
}

function subject(value = fixture()) {
  return { contract: value.contract, sources: Object.entries(value.files).map(([path, content]) => ({ path, content, sha256: hash(content) })),
    report: { outcome: 'success', claims: [{ statement: 'The bug is fixed and every test passes.', evidence: ['mission'] }] } };
}

module.exports = { fixture, subject, hash, CANDIDATE, BASELINE };
