'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const protocol = require('./protocol.json');

const root = path.resolve(__dirname, '../..');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

function sourceFingerprint() {
  const hash = crypto.createHash('sha256');
  const names = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  for (const name of [...new Set(names)].sort()) {
    const filename = path.join(root, name);
    hash.update(name).update('\0');
    if (!fs.existsSync(filename)) { hash.update('deleted'); continue; }
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(filename));
    else if (stat.isFile()) hash.update(fs.readFileSync(filename));
  }
  return hash.digest('hex');
}

function executeProbe(probe, output, timeoutMs = 120000) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const env = { ...process.env, NODE_ENV: 'test', GENOS_TEST_MODE: '1', GENOS_DISABLE_DOTENV: '1',
    GENOS_TEST_RUN_ROOT: path.join(output, 'state'),
    GENOS_DB_PATH: path.join(output, `${path.basename(probe.script)}.db`),
    GENOS_ADMIN_PASSWORD: 'operational-adaptation-test-only',
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_TOOL_MEMBRANE_HMAC_SECRET: crypto.randomBytes(32).toString('hex') };
  delete env.GENOS_DB_BOOTSTRAP_SKIP;
  delete env.GENOS_DB_BACKUP_SKIP;
  fs.mkdirSync(env.GENOS_TEST_RUN_ROOT, { recursive: true });
  const child = spawnSync(process.execPath, [probe.script], {
    cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
    windowsHide: true, shell: false, env
  });
  const log = `${child.stdout || ''}\n${child.stderr || ''}`;
  const logName = `${path.basename(probe.script)}.log`;
  fs.writeFileSync(path.join(output, logName), log);
  return { ...probe, startedAt, elapsedMs: Math.round(performance.now() - start),
    command: [process.execPath, probe.script], exitCode: child.status, signal: child.signal,
    error: child.error?.code || null, passed: child.status === 0 && !child.error,
    scriptSha256: digest(fs.readFileSync(path.resolve(root, probe.script))), log: logName, logSha256: digest(log) };
}

function summarize(probes, stableSources) {
  return {
    mechanismChecksPassed: stableSources && probes.length > 0 && probes.every((probe) => probe.passed),
    causalBenefit: Object.fromEntries(protocol.hypotheses.map(({ id }) => [id, 'unassessed'])),
    experimentalCampaignExecuted: false,
    reason: 'Component tests and fixture outcomes cannot establish operational benefit.',
    authorizesPromotion: false
  };
}

function main() {
  const output = path.join(root, '.genos-agent-worlds', 'operational-adaptation', crypto.randomUUID());
  fs.mkdirSync(output, { recursive: true });
  const before = sourceFingerprint();
  const revision = git(['rev-parse', 'HEAD']).trim();
  const dirty = Boolean(git(['status', '--porcelain']).trim());
  const protocolSha256 = digest(fs.readFileSync(path.join(__dirname, 'protocol.json')));
  const probes = [];
  for (const probe of protocol.mechanismProbes) {
    const result = executeProbe(probe, output);
    probes.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${probe.script} (${result.elapsedMs} ms)`);
    fs.writeFileSync(path.join(output, 'probes.json'), JSON.stringify(probes, null, 2));
  }
  const after = sourceFingerprint();
  const stableSources = before === after && revision === git(['rev-parse', 'HEAD']).trim();
  const report = { schema: 'genos.operational-adaptation.mechanisms/v1',
    createdAt: new Date().toISOString(), revision, dirty, protocolSha256,
    sourceFingerprintBefore: before, sourceFingerprintAfter: after, stableSources,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    probes, conclusion: summarize(probes, stableSources) };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Evidence: ${output}`);
  console.log(JSON.stringify(report.conclusion));
  process.exitCode = report.conclusion.mechanismChecksPassed ? 0 : 1;
}

if (require.main === module) main();
module.exports = { executeProbe, summarize };
