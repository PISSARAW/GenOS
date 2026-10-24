'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { defaultConfig, validateProjectConfig } = require('../src/services/ontogenesis/configSchema');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'ontogenesis-g1');
const SOURCE_MANIFEST = path.join(FIXTURE_ROOT, 'manifest.v1.json');
const EXPECTED_PARENT = path.resolve('D:/GenOS-runs');

function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true,
    timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr || result.error?.message || result.status}`);
  }
  return String(result.stdout || '').trim();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function assertCampaignRoot(root) {
  if (path.dirname(root).toLowerCase() !== EXPECTED_PARENT.toLowerCase()
    || !/^ontogenesis-g1-[a-z0-9-]+$/i.test(path.basename(root))) {
    throw new Error(`Campaign root must be a new direct child of ${EXPECTED_PARENT} named ontogenesis-g1-<id>.`);
  }
  const relative = path.relative(REPO_ROOT, root);
  if (!relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Campaign root must be outside the GenOS checkout.');
  }
  if (fs.existsSync(root)) throw new Error('Campaign root already exists; refusing to overwrite it.');
  if (!fs.existsSync(EXPECTED_PARENT)) throw new Error(`Campaign parent does not exist: ${EXPECTED_PARENT}`);
}

function gitBaseline(workspace, caseId) {
  command('git', ['init', '-b', 'main'], workspace);
  command('git', ['config', 'user.name', 'Ontogenesis G1 Fixture'], workspace);
  command('git', ['config', 'user.email', 'ontogenesis-g1@example.invalid'], workspace);
  command('git', ['add', '--all'], workspace);
  command('git', ['commit', '-m', `[FIXTURE] Baseline ${caseId}`], workspace);
  const sha = command('git', ['rev-parse', 'HEAD'], workspace);
  if (command('git', ['status', '--porcelain'], workspace)) throw new Error(`Fixture ${caseId} is not clean after baseline commit.`);
  return sha;
}

function verifierFor(ecosystem, task, oracleDir) {
  if (ecosystem.id === 'js') return { program: process.execPath,
    args: [path.join(oracleDir, 'verify.cjs'), task.oracle] };
  if (ecosystem.id === 'py') return { program: 'python',
    args: [path.join(oracleDir, 'verify.py'), task.oracle] };
  return { program: process.execPath,
    args: [path.join(oracleDir, 'verify.cjs'), task.oracle] };
}

function projectConfig(caseId, workspace, check) {
  const config = defaultConfig();
  const branch = `codex/g1-${caseId}`;
  config.branch = branch;
  config.executor = 'local';
  config.budgets = { tokens: 140000, usd: 1, seconds: 600 };
  config.checks = [check];
  config.durability.maxAttempts = 2;
  config.allowPush = false;
  config.allowMerge = false;
  config.publication.enabled = false;
  config.merge.enabled = false;
  config.authority = { allowEdit: true, allowTests: true, allowCommit: true,
    paths: ['*'], branches: [branch], rules: [] };
  const result = validateProjectConfig(config);
  if (!result.ok) throw new Error(`Invalid project config for ${caseId}: ${result.errors.join(', ')}`);
  return result.config;
}

function prepareCase(root, ecosystem, task) {
  const caseId = `${ecosystem.id}-${task.id}`;
  const workspace = path.join(root, 'workspaces', caseId);
  const oracleDir = path.join(root, 'oracles', caseId);
  const recordDir = path.join(root, 'records', caseId);
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(oracleDir, { recursive: true });
  fs.mkdirSync(recordDir, { recursive: true });
  fs.cpSync(path.join(FIXTURE_ROOT, 'templates', ecosystem.projectTemplate), workspace, { recursive: true });

  if (ecosystem.id === 'js') {
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'oracles', 'javascript', 'verify.cjs'), path.join(oracleDir, 'verify.cjs'));
  } else if (ecosystem.id === 'py') {
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'oracles', 'python', 'verify.py'), path.join(oracleDir, 'verify.py'));
  } else {
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'oracles', 'rust', 'verify.cjs'), path.join(oracleDir, 'verify.cjs'));
    fs.mkdirSync(path.join(oracleDir, 'tests'), { recursive: true });
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'oracles', 'rust', 'tests', 'acceptance.rs'),
      path.join(oracleDir, 'tests', 'acceptance.rs'));
  }

  const check = verifierFor(ecosystem, task, oracleDir);
  const config = projectConfig(caseId, workspace, check);
  const projectConfigPath = path.join(recordDir, 'onto-config.json');
  writeJson(projectConfigPath, config);
  const request = { caseId, ecosystem: ecosystem.name, category: task.category,
    title: task.title, goal: task.goal, workspace, projectId: caseId, config: projectConfigPath };
  writeJson(path.join(recordDir, 'mission-request.json'), request);
  const baseSha = gitBaseline(workspace, caseId);
  return { caseId, ecosystem: ecosystem.id, category: task.category, oracleId: task.oracle,
    workspace, oracleDir, recordDir, config: projectConfigPath, database: path.join(recordDir, 'genos.sqlite'),
    baseSha, verifier: check, status: 'prepared-oracle-not-calibrated' };
}

function main() {
  const rootArgument = process.argv[2];
  if (!rootArgument || process.argv.length !== 3) {
    throw new Error('Usage: node backend/tests/prepare_ontogenesis_g1.cjs D:/GenOS-runs/ontogenesis-g1-<id>');
  }
  const root = path.resolve(rootArgument);
  assertCampaignRoot(root);
  const sourceManifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'));
  const total = sourceManifest.ecosystems.length * sourceManifest.tasks.length;
  if (total !== sourceManifest.acceptance.missionCount) throw new Error('G1 mission count does not match the sealed plan.');
  fs.mkdirSync(root, { recursive: false });
  try {
    for (const name of ['workspaces', 'oracles', 'records']) fs.mkdirSync(path.join(root, name));
    const cases = [];
    for (const ecosystem of sourceManifest.ecosystems) {
      for (const task of sourceManifest.tasks) cases.push(prepareCase(root, ecosystem, task));
    }
    const sourceRevision = command('git', ['rev-parse', 'HEAD'], REPO_ROOT);
    const campaign = { schema: 'genos.ontogenesis-g1-campaign/v1', campaignId: crypto.randomUUID(),
      status: 'prepared-not-run', securityGate: 'requires-isolated-os-runner', oracles: 'unverified',
      preparedAt: new Date().toISOString(), sourceRevision,
      sourceManifestSha256: crypto.createHash('sha256').update(fs.readFileSync(SOURCE_MANIFEST)).digest('hex'),
      acceptance: sourceManifest.acceptance,
      modelUri: null, modelUriRequiredBeforeSealing: true, cases };
    writeJson(path.join(root, 'campaign.json'), campaign);
    process.stdout.write(`${JSON.stringify({ campaignId: campaign.campaignId, root, cases: cases.length,
      status: campaign.status, securityGate: campaign.securityGate, oracles: campaign.oracles })}\n`);
  } catch (error) {
    process.stderr.write(`Preparation stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
