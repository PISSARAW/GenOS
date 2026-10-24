'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { compareRuns } = require('./score.cjs');
const { validateManifest, verifyArtifacts } = require('./run.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function verify(directory) {
  const root = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.public.json'), 'utf8'));
  const result = JSON.parse(fs.readFileSync(path.join(root, 'results.public.json'), 'utf8'));
  validateManifest(manifest);
  if (result.runs?.length !== manifest.systems.length) throw new Error('System count differs from manifest.');
  for (let index = 0; index < manifest.systems.length; index += 1) {
    const system = manifest.systems[index];
    const run = result.runs[index];
    if (run.system !== system.name || run.version !== system.version || run.tasks?.length !== manifest.tasks.length
      || run.manifestHash !== digest(manifest.tasks)) throw new Error('Run identity or task count differs from manifest.');
    for (let taskIndex = 0; taskIndex < manifest.tasks.length; taskIndex += 1) {
      const task = manifest.tasks[taskIndex];
      const measured = run.tasks[taskIndex];
      if (measured.id !== task.id) throw new Error('Task order differs from manifest.');
      verifyArtifacts(measured.metrics, root);
      const input = { schema: 'genos.agentgit-benchmark-task/v1', task, system: system.name };
      const receipt = { taskId: task.id, system: system.name, version: system.version, metrics: measured.metrics };
      if (measured.receiptHash !== digest({ input, receipt })) throw new Error('Task receipt hash mismatch.');
    }
  }
  if (JSON.stringify(compareRuns(result.runs)) !== JSON.stringify(result.report)) {
    throw new Error('Published report differs from verified runs.');
  }
  return { verified: true, systems: result.runs.length, tasks: manifest.tasks.length };
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(verify(process.argv[2]))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { verify };
