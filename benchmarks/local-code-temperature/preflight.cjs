'use strict';
const c = require('./common.cjs');
const x = require('./execution.cjs');
const task = require('./cases.cjs').CASES[0];
async function main() {
  const directory = c.path.join(c.ROOT, 'archive', 'harness-preflight-' + Date.now());
  c.fs.mkdirSync(directory);
  c.setup(directory);
  const dna = c.service('agentDna').decodeFile(c.path.join(c.SOURCE, 'agents/dna/integration/local_code_worker.dna'));
  const request = x.requestBody(dna, task, { seed: 2026110401 });
  c.assert.equal(request.options.temperature, 0.45);
  c.assert.equal(request.options.top_p, 0.9);
  c.assert.equal(typeof request.format, 'object');
  const workspace = x.prepareWorkspace(directory, task);
  const code = 'module.exports = total => { if(typeof total !== "number" || !Number.isFinite(total) || total < 0) return null; return Math.round(total * (total >= 100 ? 0.9 : 1) * 100) / 100; };';
  const response = { message: { content: JSON.stringify({ format: 'genos.file-replacement/v1',
    patches: [{ path: 'module.js', content: code }], tests: ['node check.cjs'],
    evidence: 'Harness reference; excluded from model measurements' }) } };
  const result = await x.applyCandidate({ directory, workspace, response, task });
  c.write(c.path.join(directory, 'preflight.json'), { excludedFromMeasurement: true, result });
  c.assert.equal(result.executorPassed, true);
  c.assert.equal(result.oracle.score.allPassed, true);
  console.log(JSON.stringify({ status: 'PASS', directory, executorPassed: true, oraclePassed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
