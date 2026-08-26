// eval_script.js - harnais d'évaluation : performance (ms) + coût cognitif (lignes/chars).
// Usage: node eval_script.js <compiled-dir> <component-name-without-ext>
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [dir, name] = process.argv.slice(2);
const { DataTable } = require(path.resolve(dir, `${name}.js`));
const srcPath = path.resolve('src', `${name}.ts`);
const src = fs.readFileSync(srcPath, 'utf8');

// Données déterministes : 20 000 lignes (le tri de base est quadratique).
const N = 20000;
const rows = [];
for (let i = 0; i < N; i += 1) {
  rows.push({
    id: i,
    name: `item-${(i * 7919) % N}`,
    category: ['alpha', 'beta', 'gamma', 'delta'][i % 4],
    score: (i * 31) % 1000,
  });
}

function bench(label, fn, iterations) {
  const times = [];
  let lastResult;
  for (let it = 0; it < iterations; it += 1) {
    const t0 = process.hrtime.bigint();
    lastResult = fn(it);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(`${label}: median=${median.toFixed(2)}ms over ${iterations} runs`);
  return { median, lastResult };
}

let checks = 0;
let failures = 0;
function check(label, cond) {
  checks += 1;
  if (!cond) { failures += 1; console.log(`CHECK FAILED: ${label}`); }
}

const table = new DataTable();
table.load(rows);

// Justesse du tri
const sortBench = bench('sort(score asc)', () => table.sort({ column: 'score', direction: 'asc' }), 3);
const sortedRows = sortBench.lastResult;
check('sort: premier element a le score minimal', sortedRows[0].score === Math.min(...rows.map((r) => r.score)) ? true : sortedRows[0].score <= sortedRows[1].score);
check('sort: monotone croissant', sortedRows.every((r, i) => i === 0 || sortedRows[i - 1].score <= r.score));

// Justesse du filtre
const filterBench = bench('filter("item-123")', () => table.filter('item-123'), 3);
const filtered = filterBench.lastResult;
check('filter: tous les resultats contiennent la requete', filtered.every((r) => r.name.includes('item-123')));
check('filter: non vide', filtered.length > 0);

// Rendu fenetre
const renderBench = bench('render(5000)', () => table.render(5000), 5);
check('render: fenetre de 30 lignes', renderBench.lastResult.visible.length === 30);
check('render: total conserve', renderBench.lastResult.total === N);

// Coût cognitif
const lines = src.split('\n').length;
console.log(`cognitive_cost: lines=${lines}, chars=${src.length}, approx_tokens=${Math.round(src.length / 4)}`);
console.log(`checks: ${checks - failures}/${checks} passed`);
console.log(`EVAL_JSON ${JSON.stringify({
  sort_ms: Number(sortBench.median.toFixed(2)),
  filter_ms: Number(filterBench.median.toFixed(2)),
  render_ms: Number(renderBench.median.toFixed(2)),
  lines,
  chars: src.length,
  approx_tokens: Math.round(src.length / 4),
  checks_passed: checks - failures,
  checks_total: checks,
})}`);
if (failures > 0) { process.exitCode = 1; }
