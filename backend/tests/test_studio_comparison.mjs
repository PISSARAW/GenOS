import assert from 'node:assert/strict';
import { comparisonRows } from '../../integrations/studio/comparison.mjs';

const jobs = [
  { id: '<script>', status: 'completed', inputsHash: 'hash-a', qualityGuarantee: false,
    metrics: { total: 0, passed: 0, score: 0, graderSummary: { exact_match: { score: 0, complete: true } } } },
  { id: 'queued', status: 'queued', inputsHash: null, qualityGuarantee: false }
];
const rows = comparisonRows(jobs);
assert.deepEqual(rows.find(([label]) => label === 'Score global'), ['Score global', '0', 'Inconnu']);
assert.deepEqual(rows.find(([label]) => label === 'Entrées figées'), ['Entrées figées', 'hash-a', 'Inconnu']);
assert.deepEqual(rows.find(([label]) => label === 'Garantie de qualité'), ['Garantie de qualité', 'Non', 'Non']);
assert.deepEqual(rows.find(([label]) => label === 'exact_match · complet'), ['exact_match · complet', 'Oui', 'Inconnu']);
assert.deepEqual(comparisonRows([]).map(row => row.length), Array(7).fill(1));
console.log('Studio comparison: aligned metrics, null/zero and false guarantees passed.');
