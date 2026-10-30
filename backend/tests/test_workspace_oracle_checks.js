'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { checkWorkspace, STRATEGIES } = require('../src/services/epistemic/oracleWorkspaceChecks');
const contracts = require('../src/services/epistemic/workspaceVerificationContract');
const kinds = require('../src/services/agents/workerKindService');

function subject(kind, files, options = {}) {
  const sources = Object.entries(files).map(([path, content]) => ({ path, content,
    sha256: crypto.createHash('sha256').update(content).digest('hex') }));
  return { contract: { version: 1, kind, sources: sources.map(({ path, sha256 }) => ({ path, sha256 })),
    ...options }, sources };
}

function verify(value, candidate, status = 'verified') {
  const report = { outcome: 'success', claims: [{ statement: JSON.stringify(candidate), evidence: ['mission'] }] };
  for (const strategy of STRATEGIES) {
    const result = checkWorkspace({ ...value, report }, strategy);
    assert.equal(result.status, status, JSON.stringify({ strategy, result }));
  }
}

const stats = subject('observed_statistics', { 'sales.csv': 'day,sales\n1,8\n2,12\n3,10\n4,\n5,15\n6,5\n7,10\n8,20\n' },
  { columns: { value: 'sales' } });
verify(stats, { count: 7, total: 80, mean: 80 / 7, median: 10, max: 20 });
verify(stats, { count: 8, total: 80, mean: 10, median: 10, max: 20 }, 'refuted');

const jobs = subject('two_machine_partition', { 'jobs.csv': 'id,duration\nA,17\nB,23\nC,11\nD,19\n' },
  { columns: { id: 'id', duration: 'duration' } });
verify(jobs, { machines: [['A', 'D'], ['B', 'C']], charges: [36, 34], makespan: 36 });
verify(jobs, { machines: [['A', 'C'], ['B', 'D']], charges: [28, 32], makespan: 32 }, 'refuted');
verify(jobs, { machines: [['A', 'A'], ['B', 'C']], charges: [34, 34], makespan: 34 }, 'refuted');

const logs = subject('literal_logs', { 'service.log': 'request=1 status=timeout\nrequest=2 status=ok\nrequest=3 status=timeout\n' },
  { needle: 'status=timeout' });
verify(logs, { lines: [1, 3], requests: [1, 3], cause: null });
verify(logs, { lines: [1, 3], requests: [1, 3], cause: 'network' }, 'refuted');

const science = subject('paired_means', { 'latency.csv': 'before,after\n100,92\n120,110\n80,78\n100,90\n' },
  { files: { science: 'latency.csv' }, columns: { before: 'before', after: 'after' } });
verify(science, { beforeMean: 100, afterMean: 92.5, reduction: 7.5, reductionPercent: 7.5, causalityEstablished: false });
verify(science, { beforeMean: 100, afterMean: 92.5, reduction: 7.5, reductionPercent: 7.5, causalityEstablished: true }, 'refuted');

const api = subject('json_field_contract', { 'spec.md': 'JSON jobId.', 'example.json': '{"id":"job-1"}' },
  { files: { spec: 'spec.md', example: 'example.json' }, specMarker: 'JSON ' });
verify(api, { specField: 'jobId', exampleField: 'id', productionFormat: 'unknown', limitations: ['Not observed.'] });
verify(api, { specField: 'jobId', exampleField: 'id', productionFormat: 'jobId', limitations: ['Not observed.'] }, 'refuted');

const clinical = subject('synthetic_data_quality', { 'fiction.csv': 'patient,time,value\nP1,10:00,\nP2,09:00,74\nP2,09:00,74\n' },
  { columns: { patient: 'patient', time: 'time', value: 'value' }, scope: 'synthetic_data_quality' });
const quality = { missing: [{ patient: 'P1', time: '10:00' }], possibleDuplicates: [{ patient: 'P2', time: '09:00' }],
  diagnosis: null, treatment: null, limitations: ['Fictional data only.'] };
verify(clinical, quality);
verify(clinical, { ...quality, treatment: 'medication' }, 'refuted');

const art = subject('poem_constraints', { 'commission.txt': 'Two stanzas of six lines.' });
verify(art, { stanzas: [Array(6).fill('La pluie chante au toit'), Array(6).fill('Le tambour des gouttes')] }, 'inconclusive');
verify(art, { stanzas: [Array(6).fill('nuit'), Array(6).fill('son')] }, 'refuted');

const music = subject('bar_durations', { 'bars.txt': 'Mesure 1 : noire noire noire noire\nMesure 2 : blanche noire noire\nMesure 3 : blanche blanche noire\nMesure 4 : ronde\n',
  'units.txt': 'Mesure a 4 temps. Noire=1, blanche=2, ronde=4.' },
{ files: { music: 'bars.txt', musicRules: 'units.txt' } });
verify(music, { durations: [4, 4, 5, 4], invalidBars: [3], correctedMeasure3: ['blanche', 'blanche'] });
verify(music, { durations: [4, 4, 4, 4], invalidBars: [], correctedMeasure3: ['blanche', 'blanche'] }, 'refuted');

const history = subject('git_numeric_history', { 'current.txt': 'timeout_ms = 1500\n', 'history.txt': 'Previous 1000, now 1500.' },
  { files: { current: 'current.txt', history: 'history.txt' }, currentPath: 'current.txt', key: 'timeout_ms' });
history.history = { content: 'timeout_ms = 1000\n' };
verify(history, { currentTimeoutMs: 1500, previousTimeoutMs: 1000, sources: ['current.txt', 'history.txt'] });
verify(history, { currentTimeoutMs: 1000, previousTimeoutMs: 1500, sources: ['current.txt', 'history.txt'] }, 'refuted');

const audit = subject('csv_report_total', { 'orders.csv': 'id,amount\nA,40\nB,25\nC,35\n', 'report.md': 'Total des commandes : 100\n' },
  { columns: { value: 'amount' }, files: { data: 'orders.csv', report: 'report.md' }, artifactPath: 'report.md' });
verify(audit, null);
const wrongAudit = structuredClone(audit);
wrongAudit.sources[1].content = 'Total des commandes : 90\n';
verify(wrongAudit, null, 'refuted');

const code = subject('python_palindrome', { 'code.py': "def is_palindrome(text):\n normal = text.replace(' ', '').lower()\n return normal == normal[::-1]\n" },
  { files: { artifact: 'code.py' }, artifactPath: 'code.py', inputDomain: 'ascii' });
verify(code, null);
const invalidCode = structuredClone(code);
invalidCode.sources[0].content = 'def is_palindrome(text):\n return text == text[::-1]\n';
verify(invalidCode, null, 'refuted');
const hostileCode = structuredClone(code);
hostileCode.sources[0].content = "import os\ndef is_palindrome(text):\n return os.system('anything')\n";
verify(hostileCode, null, 'inconclusive');

assert.throws(() => contracts.assertContract({ ...stats.contract, sources: [{ path: '../secret', sha256: 'a'.repeat(64) }] }));
assert.throws(() => contracts.assertMatches({ assignment: { workspaceVerificationContract: stats.contract } },
  { workerAssignment: { workspaceVerificationContract: jobs.contract } }), { code: 'WORKSPACE_VERIFICATION_CONTRACT_MISMATCH' });
const mission = { workerKind: 'bounded_worker', workerAssignment: { workerKind: 'bounded_worker',
  workspaceVerificationContract: stats.contract } };
assert.equal(require('../src/services/agents/workerRuntimeLimitsService').isDeterministicWorkerMission(mission), false);
assert.deepEqual(kinds.buildWorkerContract('bounded_worker', mission).assignment.workspaceVerificationContract, stats.contract);
console.log('Workspace postconditions: independent positive/negative checks, human limits and sealed assignment: PASS');
