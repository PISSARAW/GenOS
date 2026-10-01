'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

function location(input) {
  if (!input.session_id || !input.cwd) throw new Error('Missing Codex session identity or workspace.');
  const root = fs.realpathSync(input.cwd);
  const id = digest(`${root}\0${input.session_id}`);
  const directory = path.join(root, '.genos-agent-worlds', 'codex-sessions', id);
  fs.mkdirSync(directory, { recursive: true });
  return { root, id, directory, file: path.join(directory, 'session.json') };
}

function fingerprint(root) {
  const names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
  const hash = crypto.createHash('sha256');
  for (const name of [...new Set(names)].sort()) {
    hash.update(name).update('\0');
    const file = path.join(root, name);
    if (!fs.existsSync(file)) { hash.update('deleted'); continue; }
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(file));
    else if (stat.isFile()) hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function load(place) {
  if (fs.existsSync(place.file)) return JSON.parse(fs.readFileSync(place.file, 'utf8'));
  const agent = path.join(place.directory, 'agent.json');
  fs.writeFileSync(agent, JSON.stringify({ cell_id: place.id, name: 'Codex development session', role: 'developer' }));
  return { session: place.id, workspace: place.root, agent, snapshot: path.join(place.directory, 'baseline.json'), baseline: fingerprint(place.root), events: [] };
}

function save(place, state) {
  const temporary = `${place.file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  fs.renameSync(temporary, place.file);
}

function successfulMcp(response) {
  if (!response || response.isError === true) return null;
  const text = response.content?.find((item) => item.type === 'text')?.text;
  try {
    const result = JSON.parse(text);
    return result.success === true ? result : null;
  } catch { return null; }
}

module.exports = { location, fingerprint, load, save, successfulMcp };
