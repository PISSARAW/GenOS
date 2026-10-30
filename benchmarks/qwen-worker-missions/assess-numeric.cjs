'use strict';
const unmeasured = reason => ({ status: 'unmeasured', reason });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, required, optional = []) {
  return record(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => [...required, ...optional].includes(key));
}
function canonical(report) {
  if (!Array.isArray(report.claims) || report.claims.length !== 1
    || typeof report.claims[0].statement !== 'string') return null;
  return require('./assess-json.cjs').parseExactJson(report.claims[0].statement);
}
function result(checks) {
  return { status: checks.every(row => row.actual === row.expected) ? 'passed' : 'failed', checks };
}
const check = (label, actual, expected) => ({ label, actual, expected });
const finite = value => typeof value === 'number' && Number.isFinite(value);
function optimal(jobs) {
  const values = Object.values(jobs); const total = values.reduce((a, b) => a + b, 0);
  return Math.min(...Array.from({ length: 1 << values.length }, (_, mask) => {
    const load = values.reduce((sum, value, i) => sum + ((mask & (1 << i)) ? value : 0), 0);
    return Math.max(load, total - load);
  }));
}
function machine(value) {
  return keys(value, ['id', 'jobs', 'load']) && Number.isInteger(value.id) && finite(value.load)
    && Array.isArray(value.jobs) && value.jobs.every(job => ['A', 'B', 'C', 'D'].includes(job));
}
function schedule(report) {
  const value = canonical(report);
  if (!keys(value, ['machines', 'total', 'makespan'], ['optimal'])
    || !Array.isArray(value.machines) || value.machines.length !== 2 || !value.machines.every(machine)) return unmeasured('A single canonical schedule JSON claim is required.');
  if (![value.total, value.makespan].every(finite) || (Object.hasOwn(value, 'optimal') && typeof value.optimal !== 'boolean')) return unmeasured('Schedule metrics must be numeric and optimal must be boolean.');
  const jobs = { A: 17, B: 23, C: 11, D: 19 };
  const loads = value.machines.map(row => row.jobs.reduce((sum, name) => sum + jobs[name], 0));
  const checks = [check('machine identities', value.machines.map(row => row.id).sort().join(''), '12'),
    check('each job exactly once', value.machines.flatMap(row => row.jobs).sort().join(''), 'ABCD'),
    check('total workload', value.total, 70),
    ...value.machines.map((row, index) => check(`machine ${row.id} load`, row.load, loads[index])),
    check('makespan', value.makespan, Math.max(...loads))];
  if (value.optimal === true) checks.push(check('claimed optimal makespan', value.makespan, optimal(jobs)));
  return result(checks);
}
function sales(report) {
  const value = canonical(report); const labels = ['count', 'sum', 'mean', 'median', 'maximum'];
  if (!keys(value, labels) || !labels.every(label => finite(value[label]))) return unmeasured('A single canonical sales JSON claim is required.');
  const values = [10,20,0,null,30,40,50,60].filter(value => value !== null).sort((a,b) => a-b);
  const sum = values.reduce((a,b) => a+b,0);
  const expected = { count: values.length, sum, mean: sum / values.length,
    median: values[Math.floor(values.length/2)], maximum: Math.max(...values) };
  return result(labels.map(label => check(label, value[label], expected[label])));
}
function match(value) {
  return keys(value, ['source', 'offset']) && ['log1','log2','log3'].includes(value.source)
    && Number.isInteger(value.offset) && value.offset >= 0;
}
function logs(report) {
  const value = canonical(report);
  if (!keys(value, ['matches']) || !Array.isArray(value.matches) || !value.matches.every(match)) return unmeasured('A single canonical log-match JSON claim is required.');
  const actual = value.matches.map(row => `${row.source}:${row.offset}`).sort();
  const inputs = { log1: 'node timeout=30', log2: 'timeout timeout', log3: 'ok Timeout timeout' };
  const expected = Object.entries(inputs).flatMap(([name,text]) => [...text.matchAll(/timeout/g)].map(row => `${name}:${row.index}`)).sort();
  return result([check('exhaustive literal matches and offsets', JSON.stringify(actual), JSON.stringify(expected))]);
}
function measurementChecks(report, value) {
  const rows = report.workerArtifact?.content?.measurements;
  if (!rows) return [];
  const labels = ['mean_before','mean_after','difference'];
  if (!Array.isArray(rows) || rows.length !== 3 || labels.some(label => rows.filter(row => row.metric === label).length !== 1)) return null;
  return rows.flatMap(row => [check(`${row.metric} artifact value`, row.value, value[row.metric]), check(`${row.metric} unit`, row.unit, 'ms')]);
}
function latencies(report) {
  const value = canonical(report); const labels = ['mean_before','mean_after','difference'];
  if (!keys(value, [...labels,'causal']) || !labels.every(label => finite(value[label])) || typeof value.causal !== 'boolean') return unmeasured('A single canonical latency JSON claim is required.');
  const artifact = measurementChecks(report, value);
  if (artifact === null) return unmeasured('Latency artifact measurements are ambiguous or duplicated.');
  const mean = values => values.reduce((a,b) => a+b,0)/values.length;
  const before = mean([100,120,110,130]); const after = mean([90,100,105,110]);
  return result([check('mean before',value.mean_before,before),check('mean after',value.mean_after,after),
    check('difference',value.difference,before-after),check('no causal conclusion',value.causal,false),...artifact]);
}
module.exports = { schedule, sales, logs, latencies, canonical };
