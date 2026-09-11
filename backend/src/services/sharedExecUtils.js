const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');

const MAX_OUTPUT = 16000;

function run(..._args) {
  const [command, args, cwd, timeoutMs] = _args;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const startedAt = Date.now();
    const timer = setTimeout(() => terminateChild(child), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-MAX_OUTPUT); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-MAX_OUTPUT); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ command: [command, ...args].join(' '), exitCode, signal, durationMs: Date.now() - startedAt, stdout, stderr });
    });
  });
}

async function walk(directory, relative = '', callback = null) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const childPath = path.join(directory, entry.name);
    if (callback) {
      const result = await callback(entry, childRelative, childPath);
      if (result === 'skip') continue;
    }
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const subResults = await walk(childPath, childRelative, callback);
      results.push(...subResults);
    } else {
      results.push({ path: childRelative.split(path.sep).join('/'), entry });
    }
  }
  return results;
}

function spawnGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `git ${args.join(' ')} exited with code ${code}`))));
  });
}

module.exports = {
  run,
  walk,
  spawnGit
};
