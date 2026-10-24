'use strict';

const fs = require('node:fs');
const path = require('node:path');

function realInside(root, candidate) {
  try {
    const realRoot = fs.realpathSync(root); const realCandidate = fs.realpathSync(candidate);
    const relative = path.relative(realRoot, realCandidate);
    return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  } catch { return false; }
}
function attemptDirectories(input) {
  const { seedPath, seedName, reportsRoot, errors } = input;
  if (!fs.existsSync(seedPath)) return [];
  if (!realInside(reportsRoot, seedPath)) { errors.push(seedName + ' directory escapes reports.'); return []; }
  const entries = fs.readdirSync(seedPath, { withFileTypes: true });
  if (entries.some((entry) => /^attempt-\d+$/.test(entry.name) && !entry.isDirectory())) errors.push(seedName + ' has a non-directory attempt entry.');
  const attempts = entries.filter((entry) => entry.isDirectory() && /^attempt-\d+$/.test(entry.name))
    .map((entry) => ({ attempt: Number(entry.name.slice(8)), path: path.join(seedPath, entry.name) }))
    .sort((left, right) => left.attempt - right.attempt);
  verifyAttemptSequence(attempts, seedName, errors);
  return attempts;
}
function verifyAttemptSequence(attempts, seed, errors) {
  if (!attempts.length) return;
  attempts.forEach((item, index) => {
    if (item.attempt !== index + 1) errors.push(seed + ' attempt sequence has a gap before ' + item.attempt + '.');
    if (!realInside(path.dirname(item.path), item.path)) errors.push(seed + ' attempt directory escapes its seed folder.');
  });
}
function readAttempt(input) {
  const { directory, seed, reportsRoot, validateReport } = input;
  const file = path.join(directory.path, 'report.json');
  if (!fs.existsSync(file) || !realInside(reportsRoot, file)) return { attempt: directory.attempt, status: 'fail', errors: ['Attempt report is missing or escapes reports.'] };
  let report;
  try { report = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return { attempt: directory.attempt, status: 'fail', errors: ['Attempt report is invalid JSON.'] }; }
  if (report.seed !== seed || report.attempt !== directory.attempt) return { attempt: directory.attempt, status: 'fail', errors: ['Attempt identity differs from directory.'] };
  const result = validateReport(report, file);
  return { attempt: directory.attempt, status: result.valid ? result.status : 'fail',
    errors: result.errors || [], reportPath: path.relative(reportsRoot, file).split(path.sep).join('/') };
}
function seedResult(seed, attempts) {
  if (attempts.some((item) => item.status === 'fail')) return { seed, status: 'fail', attempts };
  if (attempts.some((item) => item.status === 'pass')) return { seed, status: 'pass', attempts };
  return { seed, status: 'inconclusive', attempts };
}
function unexpectedDirectories(reportsRoot, seedSet) {
  if (!fs.existsSync(reportsRoot)) return [];
  return fs.readdirSync(reportsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'pilot' && !seedSet.has(entry.name))
    .map((entry) => 'Unregistered seed directory: ' + entry.name);
}
function campaignStatus(input) {
  const { results, threshold, errors, missing } = input;
  if (errors.length) return 'fail';
  if (missing) return 'inconclusive';
  const passes = results.filter((entry) => entry.status === 'pass').length;
  const undecided = results.filter((entry) => entry.status === 'inconclusive').length;
  if (passes >= threshold) return 'pass';
  return passes + undecided >= threshold ? 'inconclusive' : 'fail';
}
function evaluateCampaign(input) {
  const { reportsRoot, manifest, validateReport } = input;
  const errors = [];
  const seeds = manifest.seeds;
  if (!Array.isArray(seeds) || seeds.length !== manifest.minimumSeeds || new Set(seeds).size !== seeds.length) {
    return { status: 'fail', errors: ['Manifest seed list does not match its unique minimumSeeds contract.'], seeds: [] };
  }
  const seedSet = new Set(seeds);
  errors.push(...unexpectedDirectories(reportsRoot, seedSet));
  const results = seeds.map((seed) => {
    const directory = path.join(reportsRoot, seed);
    const dirs = attemptDirectories({ seedPath: directory, seedName: seed, reportsRoot, errors });
    const attempts = dirs.map((item) => readAttempt({ directory: item, seed, reportsRoot, validateReport }));
    return seedResult(seed, attempts);
  });
  const missing = results.some((entry) => entry.attempts.length === 0);
  const status = campaignStatus({ results, threshold: manifest.passThreshold, errors, missing });
  return { campaignId: manifest.campaignId, scenario: 'V2-06', status,
    minimumSeeds: manifest.minimumSeeds, passThreshold: manifest.passThreshold,
    counts: { pass: results.filter((entry) => entry.status === 'pass').length,
      fail: results.filter((entry) => entry.status === 'fail').length,
      inconclusive: results.filter((entry) => entry.status === 'inconclusive').length },
    missingSeeds: results.filter((entry) => entry.attempts.length === 0).map((entry) => entry.seed),
    errors, seeds: results };
}

module.exports = { evaluateCampaign };
