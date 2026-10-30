'use strict';
const text = report => (report.claims || []).map(claim => claim.statement || '').join('\n');
const unmeasured = reason => ({ status: 'unmeasured', reason });
const number = value => Number(String(value).replace(',', '.'));
function result(checks) {
  const failed = checks.filter(check => check.actual !== check.expected);
  return { status: failed.length ? 'failed' : 'passed', checks };
}
function check(label, actual, expected) { return { label, actual, expected }; }
function firstValue(source, expression) {
  const found = source.match(expression);
  return found ? number(found[1]) : null;
}
function schedule(report) {
  const source = text(report);
  const machines = [...source.matchAll(/machine\s*([12])\s*[:=]\s*([\s\S]*?)(?=machine\s*[12]\s*[:=]|$)/gi)];
  if (machines.length !== 2) return unmeasured('Two explicit machine assignments are required.');
  const jobs = { A: 17, B: 23, C: 11, D: 19 };
  const rows = machines.map(match => {
    const names = [...match[2].matchAll(/\b([ABCD])\b/g)].map(item => item[1]);
    const declared = firstValue(match[2], /(?:sum|total|load|charge)\s*(?:=|:|is|est)?\s*(\d+(?:[.,]\d+)?)/i);
    return { names, actual: names.reduce((sum, name) => sum + jobs[name], 0), declared };
  });
  if (rows.some(row => row.declared === null || !row.names.length)) return unmeasured('Assignment load is not explicit.');
  const names = rows.flatMap(row => row.names).sort().join('');
  const makespan = firstValue(source, /makespan\s*(?:=|:|is|est)?\s*(\d+(?:[.,]\d+)?)/i);
  if (makespan === null) return unmeasured('Makespan is not explicit.');
  const total = firstValue(source, /(?:total\s+(?:workload|sum|time taken)|somme totale)\s*(?:=|:|is|est)?\s*(\d+(?:[.,]\d+)?)/i);
  if (total === null) return unmeasured('Total workload is not explicit.');
  const checks = [check('machine identities', machines.map(row => row[1]).sort().join(''), '12'),
    check('each job exactly once', names, 'ABCD'), check('total workload', total, Object.values(jobs).reduce((a, b) => a + b, 0)),
    ...rows.map((row, i) => check(`machine ${i + 1} load`, row.declared, row.actual)),
    check('makespan', makespan, Math.max(...rows.map(row => row.actual)))];
  if (/minimi[sz]|optimal/i.test(source)) checks.push(check('claimed optimal makespan', makespan, optimal(jobs)));
  return result(checks);
}
function optimal(jobs) {
  const values = Object.values(jobs); const total = values.reduce((a, b) => a + b, 0);
  return Math.min(...Array.from({ length: 1 << values.length }, (_, mask) => {
    const load = values.reduce((sum, value, i) => sum + ((mask & (1 << i)) ? value : 0), 0);
    return Math.max(load, total - load);
  }));
}
function metrics(source, definitions) {
  const checks = definitions.map(([label, pattern, expected]) => check(label, firstValue(source, pattern), expected));
  const known = checks.filter(row => row.actual !== null);
  if (known.some(row => row.actual !== row.expected)) return result(known);
  return known.length === checks.length ? result(checks) : unmeasured('All requested numerical metrics must be explicit.');
}
function sales(report) {
  const values = [10, 20, 0, null, 30, 40, 50, 60].filter(value => value !== null).sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const suffix = '[^\\d\\n]{0,45}(\\d+(?:[.,]\\d+)?)';
  const pattern = label => new RegExp(`(?:${label})${suffix}`, 'i');
  return metrics(text(report), [
    ['count', pattern('numeric count|count|nombre(?: total)? de ventes|number of sales'), values.length],
    ['sum', pattern('sum|somme'), total], ['mean', pattern('mean|moyenne'), total / values.length],
    ['median', pattern('median|médiane'), values[Math.floor(values.length / 2)]],
    ['maximum', pattern('maximum|maximale|max'), Math.max(...values)]
  ]);
}
function logs(report) {
  const source = text(report);
  const rows = source.split(/\n/).map(line => ({
    source: line.match(/\blog[123]\b/i)?.[0].toLowerCase(),
    offsets: line.match(/offsets?\s*[:=(]?\s*(\d+(?:\s*,\s*\d+)*)/i)?.[1]
  }));
  if (rows.some(row => !row.source || !row.offsets)) return unmeasured('Each observation must name a log and explicit offsets.');
  if (!rows.length) return unmeasured('No observations.');
  const actual = rows.flatMap(row => row.offsets.split(',').map(n => `${row.source}:${Number(n)}`)).sort();
  const inputs = { log1: 'node timeout=30', log2: 'timeout timeout', log3: 'ok Timeout timeout' };
  const expected = Object.entries(inputs).flatMap(([name, value]) =>
    [...value.matchAll(/timeout/g)].map(match => `${name}:${match.index}`)).sort();
  return result([check('exhaustive literal matches and offsets', JSON.stringify(actual), JSON.stringify(expected))]);
}
function latencies(report) {
  const measurements = report.workerArtifact?.content?.measurements;
  if (!Array.isArray(measurements)) return unmeasured('Structured measurements are required.');
  const find = pattern => measurements.find(row => pattern.test(row.metric))?.value;
  const before = [100, 120, 110, 130]; const after = [90, 100, 105, 110];
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const checks = [check('mean before', find(/before|avant/i), mean(before)),
    check('mean after', find(/after|après/i), mean(after)),
    check('difference before minus after', find(/difference|différence/i), mean(before) - mean(after))];
  const known = checks.filter(row => Number.isFinite(row.actual));
  if (known.some(row => row.actual !== row.expected)) return result(known);
  return known.length === checks.length ? result(checks) : unmeasured('Means and their difference must be numeric.');
}
module.exports = { schedule, sales, logs, latencies };
