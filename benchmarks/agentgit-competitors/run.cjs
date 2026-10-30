'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { compareRuns, validateRun } = require('./score.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateManifest(manifest) {
  if (require('./runValues1.cjs').validateManifestValue1({ Array, manifest })) {
    throw new Error('A nonempty benchmark manifest v1 is required.');
  }
  const ids = manifest.tasks.map((task) => task.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9-]+$/.test(id))) {
    throw new Error('Task IDs must be unique lowercase slugs.');
  }
  for (const system of manifest.systems) {
    if (!system.name || !system.version || !system.adapter || !Array.isArray(system.args)) {
      throw new Error('Each system needs name, version, adapter and args.');
    }
  }
}

function executeAdapter(system, task, cwd) {
  const input = { schema: 'genos.agentgit-benchmark-task/v1', task, system: system.name };
  const command = path.resolve(cwd, system.adapter);
  return new Promise((resolve, reject) => {
    const child = spawn(command, system.args, { cwd, shell: false, windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 1_000_000) child.kill(); });
    child.stderr.on('data', (chunk) => { error += chunk; if (error.length > 4000) child.kill(); });
    child.on('error', (cause) => { clearTimeout(timer); reject(cause); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${system.name}/${task.id}: ${error.slice(0, 400) || code}`));
      try {
        const receipt = JSON.parse(output);
        if (receipt?.taskId !== task.id || receipt.system !== system.name ||
            receipt.version !== system.version || !receipt.metrics) {
          throw new Error('Adapter returned an invalid task receipt or version.');
        }
        verifyArtifacts(receipt.metrics, cwd);
        resolve({ id: task.id, metrics: receipt.metrics, receiptHash: digest({ input, receipt }) });
      } catch (cause) { reject(cause); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function verifyArtifacts(metrics, cwd) {
  const root = fs.realpathSync(cwd);
  for (const item of Object.values(metrics)) {
    if (!['pass', 'fail'].includes(item?.result)) continue;
    const relative = item.evidence?.path;
    if (typeof relative !== 'string' || !/^[a-f0-9]{64}$/.test(item.evidence?.sha256 || '')) {
      throw new Error('A pass/fail result requires a local artifact path and SHA-256.');
    }
    const full = fs.realpathSync(path.resolve(root, relative));
    if (!full.startsWith(root + path.sep)) throw new Error('Evidence artifact is outside the benchmark workspace.');
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 50_000_000) throw new Error('Evidence artifact is invalid or too large.');
    const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (actual !== item.evidence.sha256) throw new Error('Evidence artifact SHA-256 mismatch.');
  }
}

async function runManifest(manifest, cwd) {
  validateManifest(manifest);
  const runs = [];
  for (const system of manifest.systems) {
    const tasks = [];
    for (const task of manifest.tasks) tasks.push(await executeAdapter(system, task, cwd));
    const run = { schema: 'genos.agentgit-benchmark/v1', system: system.name,
      version: system.version, adapter: system.adapter, collectedAt: new Date().toISOString(),
      manifestHash: digest(manifest.tasks), tasks };
    const validation = validateRun(run);
    if (!validation.valid) throw new Error(`${system.name}: ${validation.issues.join(', ')}`);
    runs.push(run);
  }
  return { runs, report: compareRuns(runs) };
}

async function cli() {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath) throw new Error('Usage: node run.cjs <manifest.json> <output.json>');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const result = await runManifest(manifest, path.dirname(path.resolve(manifestPath)));
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}

if (require.main === module) cli().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { runManifest, validateManifest, executeAdapter, verifyArtifacts };
