'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function files(directory, ignored = []) {
  return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => !ignored.includes(entry.name)).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('LINK_FORBIDDEN');
    return entry.isDirectory() ? files(file, ignored) : [file];
  }).sort();
}
function tree(directory) {
  return Object.fromEntries(files(directory).map(file => [path.relative(directory, file).replaceAll('\\', '/'), hash(fs.readFileSync(file))]));
}
function event(directory, value) {
  const file = path.join(directory, 'events.jsonl');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
  const previous = lines.length ? JSON.parse(lines.at(-1)).hash : null;
  const payload = { index: lines.length, previous, at: new Date().toISOString(), ...value };
  const entry = { ...payload, hash: hash(JSON.stringify(payload)) };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  return entry.hash;
}
function verifyEvents(directory) {
  let previous = null;
  const lines = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n');
  lines.forEach((line, index) => {
    const { hash: digest, ...payload } = JSON.parse(line);
    if (payload.index !== index || payload.previous !== previous || hash(JSON.stringify(payload)) !== digest) throw Error('EVENT_CHAIN_INVALID');
    previous = digest;
  });
  return previous;
}
module.exports = { root, hash, json, write, files, tree, event, verifyEvents };
