'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const protocol = require('./protocol.json');
const { hash } = require('./corpus.cjs');

function sources() {
  const own = fs.readdirSync(__dirname).filter(name => /\.(cjs|json)$/.test(name)).map(name => path.join(__dirname, name));
  const identity = path.join(protocol.sourceRoot, 'backend/src/services/identity');
  const production = fs.readdirSync(identity).filter(name => name.endsWith('.js')).map(name => path.join(identity, name));
  production.push(...['backend/src/db/index.js','backend/src/db/migrations/migrateAgentIdentity.js',
    'backend/src/services/ontogenesis/memoryService.js', 'backend/src/services/autobiographicalMemory/episodeStore.js',
    'backend/package-lock.json'].map(name => path.join(protocol.sourceRoot, name)));
  return [...own, ...production];
}

function sourceHashes() {
  return Object.fromEntries(sources().sort().map(file => [file, hash(fs.readFileSync(file))]));
}

async function fileHash(filename) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename, { highWaterMark: 8 * 1024 * 1024 })) digest.update(chunk);
  return digest.digest('hex');
}

function provenance() {
  const git = args => execFileSync('git', args, { cwd: protocol.repositoryRoot, encoding: 'utf8' }).trim();
  return { revision: git(['rev-parse','HEAD']), status: git(['status','--short']),
    node: process.version, platform: process.platform, sources: sourceHashes() };
}

function journal(directory) {
  const filename = path.join(directory, 'events.jsonl');
  const lines = fs.readFileSync(filename, 'utf8').trim().split('\n');
  let previous = null;
  return lines.map((line, index) => {
    const entry = JSON.parse(line);
    const { hash: recorded, ...payload } = entry;
    if (payload.index !== index || payload.previous !== previous || hash(payload) !== recorded) throw Error('JOURNAL_CHAIN_BROKEN');
    previous = recorded;
    return entry;
  });
}

function write(directory, name, value) {
  fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2), { flag: 'wx' });
}

module.exports = { sources, sourceHashes, fileHash, provenance, journal, write };
