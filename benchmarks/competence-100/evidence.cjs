'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { hash } = require('./corpus.cjs');
const ROOT = path.resolve(__dirname, '../..');

function sourceHashes() {
  const local = fs.readdirSync(__dirname).filter(name => /\.(cjs|json)$/.test(name))
    .map(name => 'benchmarks/competence-100/' + name);
  const production = ['backend/src/services/ontogenesis/memoryService.js',
    'backend/src/services/abstentionService.js', 'backend/package-lock.json'];
  return Object.fromEntries([...local, ...production].sort().map(name => [name,
    hash(fs.readFileSync(path.join(ROOT, name), 'utf8'))]));
}

function provenance() {
  const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { revision: git(['rev-parse', 'HEAD']).trim(), dirty: git(['status', '--porcelain']).trim(),
    node: process.version, platform: process.platform, sources: sourceHashes() };
}

function journal(directory) {
  let previous = null;
  let index = 0;
  return event => {
    const payload = { index: index++, previous, at: new Date().toISOString(), ...event };
    const entry = { ...payload, hash: hash(payload) };
    fs.appendFileSync(path.join(directory, 'events.jsonl'), JSON.stringify(entry) + '\n');
    previous = entry.hash;
    return previous;
  };
}

function oracle(input) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'oracle.cjs')], {
    input: JSON.stringify(input), encoding: 'utf8', timeout: 5000, windowsHide: true
  });
  if (child.status !== 0 || child.error) throw Error('Oracle process failed: ' + child.stderr);
  return JSON.parse(child.stdout);
}

function write(directory, name, value) {
  fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2), { flag: 'wx' });
}

function copySources(directory, hashes) {
  for (const name of Object.keys(hashes)) {
    const destination = path.join(directory, 'sources', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, name), destination);
  }
}

function readJournal(directory) {
  const lines = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n');
  let previous = null;
  return lines.map((line, index) => {
    const entry = JSON.parse(line);
    const { hash: recorded, ...payload } = entry;
    if (payload.index !== index || payload.previous !== previous || hash(payload) !== recorded) {
      throw Error('Evidence journal chain mismatch');
    }
    previous = recorded;
    return entry;
  });
}

module.exports = { ROOT, sourceHashes, provenance, journal, oracle, write, copySources, readJournal };
