const { spawn } = require('child_process');
const path = require('path');
const { appendBounded } = require('../boundedOutput');
const { terminateChild } = require('../processTermination');

const gitRepoMutexes = new Map();

function runCommand(command, args, { cwd, input, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = command === 'git'
      ? {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0'
      }
      : process.env;
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      terminateChild(child);
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`)); });
    child.stdin.end(input || '');
  });
}

async function withGitRepoLock(repoPath, fn) {
  const resolved = path.resolve(repoPath);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  let previous = gitRepoMutexes.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  gitRepoMutexes.set(key, previous.then(() => current, () => current));

  try {
    await previous;
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts && /index\.lock|cannot lock ref|locked|already exists/i.test(err.message || '')) {
          const delay = Math.floor(100 * Math.pow(1.5, attempts - 1) + Math.random() * 100);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  } finally {
    release();
    if (gitRepoMutexes.get(key) === current) {
      gitRepoMutexes.delete(key);
    }
  }
}

module.exports = { runCommand, withGitRepoLock };
