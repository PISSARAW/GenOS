'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const repo = path.resolve(root, '../..');
const suite = JSON.parse(fs.readFileSync(path.join(root, 'suite.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(root, 'comparison-plan.json'), 'utf8'));
const taskSet = JSON.parse(fs.readFileSync(path.join(root, plan.taskSetFile), 'utf8'));
const outputRoot = path.resolve(process.env.GENOS_COMPARISON_OUTPUT_ROOT || path.join(repo, 'artifacts', 'topology-morphogenesis', 'readiness'));

function pendingAdapters() {
  return plan.conditions.filter((condition) => condition.adapter === 'pending').map((condition) => condition.id);
}

function nonAutonomousArms() {
  return plan.conditions.filter((condition) => condition.autonomous === false).map((condition) => condition.id);
}

function pilotOnlyTasks() {
  return (taskSet.status || '').includes('pilot') ? taskSet.tasks.map((task) => task.id) : [];
}

function missingTopologyProbes(tasks = suite.tasks) {
  return tasks.filter((task) => task.family === 'topology' && !topologyProbeAdmissible(task))
    .map((task) => task.id);
}

function topologyProbeAdmissible(task) {
  return Boolean(task.mechanismProbe && task.mechanismProbeScope === 'mission-outcome'
    && task.mechanismProbeVerificationEligible === true && task.oracle?.status === 'independent');
}

function hasIndependentMissionOracle(task) {
  return task?.oracle?.status === 'independent';
}

function missingMissionOracles(tasks = suite.tasks) {
  return tasks.filter((task) => task.family === 'topology' && !hasIndependentMissionOracle(task))
    .map((task) => task.id);
}

function nonMissionProbePromoted(tasks = suite.tasks) {
  return tasks.filter((task) => task.mechanismProbeVerificationEligible === true
    && task.mechanismProbeScope !== 'mission-outcome')
    .map((task) => task.id);
}

function unassignedHypotheses() {
  const required = ['adaptedCondition', 'wrongCondition', 'rationale', 'primaryMetric', 'falsifier'];
  return taskSet.tasks.filter((task) => task.comparisonEligible
    && (!task.topologyHypothesis || required.some((key) => !String(task.topologyHypothesis[key] || '').trim())))
    .map((task) => task.id);
}

function sourceState() {
  const changes = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  return { workingTreeClean: changes.length === 0, changedPathCount: changes.length };
}

function buildReadiness() {
  const blockers = [];
  const adapters = pendingAdapters();
  const probes = missingTopologyProbes();
  const oracles = missingMissionOracles();
  const promoted = nonMissionProbePromoted();
  const hypotheses = unassignedHypotheses();
  const frozen = nonAutonomousArms();
  const pilotTasks = pilotOnlyTasks();
  if (adapters.length) blockers.push({ id: 'condition-adapters-missing', items: adapters });
  if (frozen.length) blockers.push({ id: 'autonomous-orchestration-unproven', items: frozen });
  if (pilotTasks.length) blockers.push({ id: 'pilot-only-no-general-causality', items: pilotTasks });
  if (probes.length) blockers.push({ id: 'topology-probes-missing', items: probes });
  if (oracles.length) blockers.push({ id: 'mission-oracle-missing', items: oracles });
  if (promoted.length) blockers.push({ id: 'component-smoke-not-mission-outcome', items: promoted });
  if (hypotheses.length) blockers.push({ id: 'topology-hypotheses-unassigned', items: hypotheses });
  const source = sourceState();
  if (!source.workingTreeClean) blockers.push({ id: 'source-tree-not-frozen', items: [String(source.changedPathCount)] });
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), status: blockers.length ? 'blocked' : 'ready',
    sourceState: source, blockers, promotable: false };
}

function main() {
  const report = buildReadiness();
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputFile = path.join(outputRoot, `readiness-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify({ status: report.status, blockers: report.blockers, outputFile })}\n`);
  if (report.status !== 'ready') process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { buildReadiness, missingTopologyProbes, topologyProbeAdmissible,
  hasIndependentMissionOracle, missingMissionOracles, nonMissionProbePromoted };
