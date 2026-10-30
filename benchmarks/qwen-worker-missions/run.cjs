'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const cases = require('./cases.json');
const source = path.resolve(__dirname, '../..');
const root = path.resolve(process.argv[2] || '');
if (!/^D:\\/i.test(root)) throw new Error('Supply an absolute campaign directory on D:.');
if (fs.existsSync(root)) throw new Error('Campaign directory must be new.');
const git = args => spawnSync('git', args, { cwd: source, encoding: 'utf8', windowsHide: true });
const revision = git(['rev-parse', 'HEAD']).stdout.trim();
if (git(['status', '--porcelain']).stdout.trim()) throw new Error('Commit source changes before running.');
fs.mkdirSync(root, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
function workspaceHash(workspace) {
  return hash(fs.readdirSync(workspace, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    if (entry.isSymbolicLink()) throw new Error('Fixture symlinks are not supported.');
    const file = path.join(workspace, entry.name);
    return [entry.name, entry.isDirectory() ? 'directory' : 'file', entry.isDirectory() ? workspaceHash(file) : hash(fs.readFileSync(file))];
  }).map(entry => JSON.stringify(entry)).join('\n'));
}
function producerRecord(name) {
  const artifact = path.join(root, name, 'evidence.json');
  const raw = fs.readFileSync(artifact);
  const evidence = JSON.parse(raw);
  const terminal = require('./evidence-scope.cjs').select(evidence).terminal;
  return { producer: name, artifact, sha256: hash(raw), run: terminal?.run, status: terminal?.type,
    detail: terminal?.detail, claims: terminal?.report?.claims || [], uncertainties: terminal?.report?.uncertainties || [],
    content: terminal?.report?.workerArtifact?.content || null, receipts: evidence.receipts };
}
function assessment(item, evidence, suffix) {
  return require('./assess.cjs').assess(item.id, evidence, { negative: suffix === 'neg' });
}
function fixture(item) {
  const workspace = path.join(root, `workspace-${item.id}`);
  fs.mkdirSync(workspace);
  if (item.id === '03') {
    write(path.join(workspace, 'palindrome.py'), 'def is_palindrome(text):\n    return text == text[::-1]\n');
    write(path.join(workspace, 'test_palindrome.py'), "from palindrome import is_palindrome\ndef test_case_and_spaces():\n    assert is_palindrome('Never odd or even')\n    assert is_palindrome('A b A')\ndef test_punctuation():\n    assert not is_palindrome('a!a?')\n    assert not is_palindrome('abc')\n");
  }
  if (item.id === '10') write(path.join(workspace, 'vulnerable.py'), 'import os\ndef read(root, name):\n    return open(os.path.join(root, name)).read()\n');
  if (item.id === '11') {
    for (const producer of ['03', '10']) {
      const records = fs.readdirSync(root).filter(name => name.startsWith(`${producer}-`) && fs.existsSync(path.join(root, name, 'evidence.json')))
        .map(producerRecord);
      write(path.join(workspace, `producer-${producer}.json`), records);
    }
  }
  if (item.id === '12') {
    write(path.join(workspace, 'sales.csv'), 'sale\n10\n\n20\n');
    write(path.join(workspace, 'parser.py'), "def parse(lines):\n    return [int(line.strip() or 0) for line in lines]\n");
    write(path.join(workspace, 'test_parser.py'), "from parser import parse\ndef test_missing():\n    assert parse(['10', '', '20']) == [10,20]\n");
  }
  return { path: workspace, hash: workspaceHash(workspace) };
}
function budgets(id) {
  return id === '12' ? { worker: 12000, parent: 40000 } : { worker: 9000, parent: 24000 };
}
function payload(item, workspace, negative) {
  const budget = budgets(item.id);
  const request = { action: 'dispatch_worker', workspaceRoot: workspace,
    mission: negative ? item.negative : item.positive, role: item.kind, workerKind: item.kind,
    executor: 'local', localModel: ['01', '03', '11', '12'].includes(item.id) ? 'ollama://qwen2.5-coder:32b' : 'ollama://qwen2.5-coder:7b',
    readOnlyWorkspaceEvidence: true, localContextTokens: 16384, workerTokenLimit: budget.worker,
    execution_budget: { tokens: budget.parent, costUsd: 1 }, timeoutMs: 300000 };
  if (item.id === '03' && !negative) Object.assign(request, { localCodeWorker: true, allowFileEdits: true, allowedWritePaths: ['palindrome.py'], requiredPatchPaths: ['palindrome.py'], allowedCommands: ['pytest'] });
  if (item.id === '12' && !negative) Object.assign(request, { allowFileEdits: true, allowedWritePaths: ['parser.py'], allowedCommands: ['pytest'] });
  if (item.id === '12' && negative) request.delegationLimit = 0;
  return request;
}
function execute(item, snapshot, suffix) {
  const workspace = snapshot.path;
  if (workspaceHash(workspace) !== snapshot.hash) throw new Error('Initial fixture differs between repetitions.');
  if (git(['rev-parse', 'HEAD']).stdout.trim() !== revision) throw new Error('Source revision changed during campaign.');
  const name = `${item.id}-${suffix}`;
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  const request = payload(item, workspace, suffix === 'neg');
  const initialWorkspaceHash = workspaceHash(workspace);
  const body = JSON.stringify(request);
  write(path.join(dir, 'payload.json'), body);
  const env = { ...process.env, GENOS_DB_PATH: path.join(dir, 'protocol.sqlite'), GENOS_WORKSPACE_ROOT: workspace,
    GENOS_CAPSULE_ROOT: path.join(dir, 'capsules'), GENOS_RUNNER_LOG_DIR: path.join(dir, 'logs'), GENOS_OLLAMA_ENDPOINT: 'http://127.0.0.1:11435/api/chat' };
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_WORKSPACES_ROOT']) delete env[key];
  const started = new Date().toISOString();
  process.stdout.write(`START ${name} ${started}\n`);
  const log = fs.openSync(path.join(dir, 'output.log'), 'w');
  const result = spawnSync(process.execPath, ['backend/bin/genos-orchestrate.cjs', body], { cwd: source, env, stdio: ['ignore', log, log], windowsHide: true, timeout: 900000 });
  fs.closeSync(log);
  write(path.join(dir, 'manifest.json'), { name, revision, model: request.localModel, initialWorkspaceHash, finalWorkspaceHash: workspaceHash(workspace), payloadSha256: hash(body), started, ended: new Date().toISOString(), exitCode: result.status, error: result.error?.message || null });
  const inspected = spawnSync(process.execPath, [path.join(__dirname, 'inspect.cjs'), dir], { cwd: source, encoding: 'utf8', windowsHide: true });
  write(path.join(dir, 'inspection.log'), inspected.stderr || '');
  if (inspected.status === 0) {
    const evidence = JSON.parse(inspected.stdout);
    write(path.join(dir, 'evidence.json'), evidence);
    write(path.join(dir, 'assessment.json'), assessment(item, evidence, suffix));
  } else write(path.join(dir, 'assessment.json'), { status: 'unmeasured', reason: 'Evidence inspection failed', exitCode: inspected.status });
  process.stdout.write(`FINISH ${name} exit=${result.status}\n`);
  if (workspaceHash(workspace) !== initialWorkspaceHash) throw new Error('Initial source workspace mutated during execution.');
  if (git(['rev-parse', 'HEAD']).stdout.trim() !== revision || git(['status', '--porcelain']).stdout.trim()) throw new Error('Source code changed during execution.');
}
async function main() {
  const endpoint = 'http://127.0.0.1:11435';
  const version = await (await fetch(`${endpoint}/api/version`)).json();
  const tags = await (await fetch(`${endpoint}/api/tags`)).json();
  const dependencyLocks = Object.fromEntries(['package-lock.json', 'backend/package-lock.json', 'mcp/package-lock.json'].map(name => [name, hash(fs.readFileSync(path.join(source, name)))]));
  write(path.join(root, 'campaign.json'), { revision, source, node: process.version, dependencyLocks, started: new Date().toISOString(), caseHash: hash(JSON.stringify(cases)), version, models: tags.models, sourcePinned: true });
  for (const item of cases) {
    const workspace = fixture(item);
    for (const suffix of ['r1', 'r2', 'r3', 'neg']) execute(item, workspace, suffix);
  }
}
main().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
