'use strict';
const assert = require('node:assert/strict');
const json = require('../../benchmarks/qwen-worker-missions/assess-json.cjs');
const numeric = require('../../benchmarks/qwen-worker-missions/assess-numeric.cjs');
const report = statement => ({ claims: [{ statement }] });

const sales = '{"count":7,"sum":210,"mean":30,"median":30,"maximum":60}';
assert.equal(numeric.sales(report(sales)).status, 'passed');
assert.equal(numeric.sales(report('{"count":7.0,"sum":2.10e2,"mean":3e+1,"median":30.00,"maximum":6E1}')).status, 'passed');
assert.equal(numeric.latencies(report('{"mean_before":115.0,"mean_after":1.0125e2,"difference":13.7500,"causal":false}')).status, 'passed');
assert.equal(numeric.latencies(report('{"mean_before":110.0,"mean_after":107.5,"difference":-2.5,"causal":true}')).status, 'failed');
assert.deepEqual(json.parseExactJson('{"text":"numeric 210.00000000000001 is only text","zero":-0.000e999}'),
  { text: 'numeric 210.00000000000001 is only text', zero: -0 });

for (const token of ['210.00000000000001', '2.1000000000000001e2', '210.000000000000000000000001']) {
  assert.equal(numeric.sales(report(sales.replace('210', token))).status, 'unmeasured', token);
}
for (const source of [
  '{"sum":210,"sum":210}', '{"sum":210,"s\\u0075m":210}',
  '{"outer":[{"id":1,"\\u0069d":1}]}', '{"a\\\"b":1,"a\\u0022b":1}',
  '{"n":1e999}', '{"n":1e-999}', '{"n":9007199254740993}', '{"n":NaN}', '{"n":Infinity}',
  '{"n":01}', '{"n":1.}', '{"n":+1}', '{"n":.1}', '{"n":1e}',
  '{"n":1,}', '[1,]', '{"n":1} trailing', '{"n":1}{"n":2}'
]) assert.equal(json.parseExactJson(source), null, source);

const duplicateSales = sales.replace('"sum":210', '"sum":210,"s\\u0075m":210');
assert.equal(numeric.sales(report(duplicateSales)).status, 'unmeasured');
assert.equal(numeric.schedule(report('{"machines":[{"id":1,"\\u0069d":1,"jobs":["A","D"],"load":36},{"id":2,"jobs":["B","C"],"load":34}],"total":70,"makespan":36}')).status, 'unmeasured');
assert.equal(numeric.sales(report('not a claim ' + sales)).status, 'unmeasured');
assert.equal(numeric.sales({ claims: [{ statement: sales }, { statement: sales }] }).status, 'unmeasured');
assert.equal(json.parseExactJson('['.repeat(66) + '0' + ']'.repeat(66)), null);
assert.equal(json.parseExactJson(' '.repeat(65537)), null);
assert.deepEqual(json.parseExactJson('{"left":{"id":1},"right":{"id":2}}'), { left: { id: 1 }, right: { id: 2 } });
console.log('Qwen JSON numeric forms, duplicate keys and precision boundaries: PASS');
