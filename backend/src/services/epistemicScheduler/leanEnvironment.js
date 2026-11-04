'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { buildIsolatedEnv } = require('../sandboxExecutor');

function leanProcessEnvironment(directory) {
  const names = ['HOME', 'USERPROFILE', 'ELAN_HOME', 'ELAN_TOOLCHAIN', 'LEAN_PATH'];
  const extra = Object.fromEntries(names.filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]));
  if (directory) extra.LEAN_PATH = [directory, extra.LEAN_PATH].filter(Boolean).join(path.delimiter);
  return buildIsolatedEnv(extra);
}

async function hashFile(filename, options = {}) {
  const remaining = options.deadlineAt == null ? Infinity : Math.ceil(options.deadlineAt - Date.now());
  if (remaining <= 0 || Number.isNaN(remaining)) throw new Error('Lean environment measurement deadline exceeded.');
  const signal = Number.isFinite(remaining) ? AbortSignal.timeout(remaining) : undefined;
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename, { signal })) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}

async function runtimeFiles(prefix) {
  const candidates = [path.join(prefix, 'bin'), path.join(prefix, 'lib', 'lean')];
  const result = [];
  for (const directory of candidates) {
    const names = await fs.promises.readdir(directory);
    for (const name of names) {
      if (/^(?:lean(?:\.exe)?|libleanshared.*\.(?:dll|so|dylib))$/u.test(name)) result.push(path.join(directory, name));
    }
  }
  return result;
}

async function moduleFiles(modules) {
  const result = [];
  for (const entry of modules) {
    result.push(entry.path);
    for (const suffix of ['.private', '.server']) {
      const filename = entry.path + suffix;
      if (fs.existsSync(filename)) result.push(filename);
    }
  }
  return result;
}

async function measureEnvironment(prefix, audit, options = {}) {
  const filenames = [...await runtimeFiles(prefix), ...await moduleFiles(audit.modules)];
  const entries = [];
  const ordered = [...new Set(filenames)].sort();
  for (let offset = 0; offset < ordered.length; offset += 4) {
    const measured = await Promise.allSettled(ordered.slice(offset, offset + 4).map(async filename => ({
      file: path.relative(prefix, filename).replaceAll('\\', '/'), digest: await hashFile(filename, options) })));
    const failed = measured.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    entries.push(...measured.map(result => result.value));
  }
  entries.push({ file: 'genos/leanInspector.lean', digest: await hashFile(path.join(__dirname, 'leanInspector.lean'), options) });
  const environmentDigest = `sha256:${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}`;
  return { environmentDigest, environmentManifest: entries };
}

module.exports = { hashFile, measureEnvironment, leanProcessEnvironment };
