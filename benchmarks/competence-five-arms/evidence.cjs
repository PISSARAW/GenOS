'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { hash } = require('./corpus.cjs');
const ROOT = path.resolve(__dirname, '../..');
const production = ['ontogenesis/memoryService.js', 'adaptiveStateService.js', 'hybridProceduralLearningService.js',
  'proceduralConsolidationService.js', 'proceduralPredictionErrorService.js', 'proceduralGenomePolicyService.js',
  'proceduralPlasticityService.js', 'abstentionService.js', 'experienceCompetence/learning.js',
  'experienceCompetence/contract.js', 'experienceCompetence/interpreter.js'];

function sourceHashes() {
  const local = fs.readdirSync(__dirname).filter(name => /\.(cjs|json|py)$/.test(name))
    .map(name => 'benchmarks/competence-five-arms/' + name);
  const names = [...local, ...production.map(name => 'backend/src/services/' + name)];
  return Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(ROOT, name), 'utf8'))]));
}

function copySources(directory, hashes) {
  for (const name of Object.keys(hashes)) {
    const target = path.join(directory, 'sources', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, name), target);
  }
}

function provenance() {
  const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  return { head: git(['rev-parse', 'HEAD']), dirtyPaths: git(['status', '--porcelain']),
    node: process.version, platform: process.platform, sources: sourceHashes() };
}

function write(directory, name, value) {
  fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2));
}

function journal(directory) {
  let previous = null;
  let index = 0;
  return event => {
    const row = { index: index++, previous, ...event };
    const digest = hash(row);
    fs.appendFileSync(path.join(directory, 'events.jsonl'), JSON.stringify({ ...row, hash: digest }) + '\n');
    previous = digest;
    return digest;
  };
}

function oracle(input) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'oracle.cjs')], {
    encoding: 'utf8', input: JSON.stringify(input), timeout: 60000, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw Error('Separate oracle failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function restored(filename, worldId) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'restore.cjs'), filename, worldId], {
    encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (result.status !== 0) throw Error('Separate memory restore failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

module.exports = { ROOT, sourceHashes, copySources, provenance, write, journal, oracle, restored };
