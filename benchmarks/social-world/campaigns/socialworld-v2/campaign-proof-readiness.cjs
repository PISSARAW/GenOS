'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { expectedArms, validateManifest } = require('./audit-campaign-pairs.cjs');
const { runnerDescriptor, runnerPath } = require('./runner-registry.cjs');

function discoverRunners(manifest) {
  const discovered = {};
  for (const scenario of manifest.scenarios) {
    const filename = runnerPath(scenario.id);
    const descriptor = runnerDescriptor(scenario.id);
    if (!filename || !descriptor) continue;
    discovered[scenario.id] = describeRunner(filename, descriptor);
  }
  return discovered;
}

function describeRunner(filename, descriptor) {
  return { path: path.relative(path.resolve(__dirname, '../../../..'), filename),
    arms: descriptor.arms, executableArms: descriptor.executableArms };
}

function capabilityMap(runners) {
  const map = new Map();
  for (const [scenarioId, runner] of Object.entries(runners || {})) {
    const arms = Array.isArray(runner && runner.arms) ? runner.arms : [];
    const executableArms = Array.isArray(runner && runner.executableArms) ? runner.executableArms : arms;
    map.set(scenarioId, { path: runner && runner.path, arms: new Set(arms),
      executableArms: new Set(executableArms) });
  }
  return map;
}

function missingRunnerArms(manifest, runners, repositoryRoot) {
  const capabilities = capabilityMap(runners);
  const context = { manifest, repositoryRoot, missing: [] };
  for (const scenario of manifest.scenarios) {
    appendMissingArms(scenario, capabilities.get(scenario.id), context);
  }
  return context.missing;
}

function missingExecutableArms(manifest, runners) {
  const capabilities = capabilityMap(runners);
  return manifest.scenarios.flatMap((scenario) => {
    const runner = capabilities.get(scenario.id);
    return expectedArms(manifest, scenario.id).filter((arm) => !runner || !runner.executableArms.has(arm))
      .map((arm) => ({ scenario: scenario.id, arm }));
  });
}

function appendMissingArms(scenario, runner, context) {
  const runnerExists = hasRegisteredRunner(runner, context.repositoryRoot);
  for (const arm of expectedArms(context.manifest, scenario.id)) {
    if (!runnerExists || !runner.arms.has(arm)) context.missing.push({ scenario: scenario.id, arm });
  }
}

function hasRegisteredRunner(runner, repositoryRoot) {
  if (!runner || typeof runner.path !== 'string') return false;
  const root = path.resolve(repositoryRoot);
  const runnerPath = path.resolve(root, runner.path);
  if (!runnerPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(runnerPath)) return false;
  return fs.statSync(runnerPath).isFile();
}

function assessReadiness(manifest, repositoryRoot, suppliedRunners) {
  const errors = validateManifest(manifest);
  if (errors.length) return { status: 'inconclusive', campaignConclusion: 'not-assessed', errors, missingCausalArms: [] };
  const root = path.resolve(repositoryRoot);
  const runners = suppliedRunners || discoverRunners(manifest);
  const missingCausalArms = missingRunnerArms(manifest, runners, root);
  const missingExecutable = missingExecutableArms(manifest, runners);
  const reasons = [];
  if (manifest.status !== 'ready') reasons.push(`manifest status is ${manifest.status}, expected ready`);
  if (missingCausalArms.length) reasons.push('one or more causal scenario-arm runners are not implemented and registered');
  if (missingExecutable.length) reasons.push('one or more registered arms lack executable causal treatment semantics');
  const ready = reasons.length === 0;
  return {
    status: ready ? 'ready' : 'inconclusive',
    campaignConclusion: 'not-assessed',
    canLaunch: ready,
    reasons,
    missingCausalArms,
    missingExecutableArms: missingExecutable
  };
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    process.stderr.write('Usage: node campaign-proof-readiness.cjs <manifest.json>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const result = assessReadiness(manifest, repositoryRoot);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.canLaunch) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'inconclusive', campaignConclusion: 'not-assessed', canLaunch: false,
      reasons: [error.message], missingCausalArms: [] }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { assessReadiness, discoverRunners, missingExecutableArms, missingRunnerArms };
