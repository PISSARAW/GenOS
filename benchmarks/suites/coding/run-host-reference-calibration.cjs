'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TASKS_PATH, REPOS_DIR } = require('../../../backend/src/evaluation/swe_paths');
const { verifyTaskDynamically } = require('../../../backend/src/evaluation/swe_native_verifier');

function parseOptions(args) {
  const options = { output: null, instances: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output') options.output = args[++i];
    if (args[i] === '--instances') options.instances = args[++i].split(',');
  }
  if (!options.output) throw new Error('Usage: node run-host-reference-calibration.cjs --output <report.json> [--instances id,id]');
  return options;
}

function datasetDigest() {
  return crypto.createHash('sha256').update(fs.readFileSync(TASKS_PATH)).digest('hex');
}

function selectTasks(tasks, cohort, instances) {
  const chosen = instances ? new Set(instances) : new Set(cohort);
  return tasks.filter(task => chosen.has(task.instance_id));
}

function summarize(results) {
  const eligible = results.filter(result => result.reproduced && result.resolved && result.regression_free).length;
  return { attempted: results.length, eligibleReferenceChecks: eligible,
    unresolved: results.length - eligible };
}

function runCalibration() {
  const options = parseOptions(process.argv.slice(2));
  const tasks = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'dataset.lock.json'), 'utf8'));
  if (datasetDigest() !== lock.sourceSha256) throw new Error('Dataset hash does not match dataset.lock.json.');
  if (options.instances?.some(instance => !lock.historicalPilotCohort.includes(instance))) {
    throw new Error('Requested instance IDs must belong to the locked historical pilot cohort.');
  }
  const selected = selectTasks(tasks, lock.historicalPilotCohort, options.instances);
  if (options.instances && selected.length !== options.instances.length) {
    throw new Error('One or more requested instance IDs are absent from the locked dataset.');
  }
  const results = selected.map(task => {
    if (!task.patch) throw new Error(`Missing oracle-only reference patch: ${task.instance_id}`);
    return verifyTaskDynamically(task, task.patch);
  });
  const report = { schema: 'genos.swe.host_reference_calibration/v1', docker: false,
    genosEvaluated: false, datasetRevision: lock.revision, datasetSha256: datasetDigest(),
    reposDir: REPOS_DIR, ...summarize(results), results };
  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(summarize(results))}\n`);
}

runCalibration();
