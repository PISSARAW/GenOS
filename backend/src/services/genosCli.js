/**
 * GenOS CLI Bridge Service
 *
 * Spawns the Rust `genos` binary so Studio can operate the real core
 * (snapshots, hallucination analysis, replay, diff) instead of the
 * Node-side reimplementations. All state lives under a dedicated root so
 * bridge operations never mix with the backend's SQLite store.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');

function resolveGenosBin() {
  if (process.env.GENOS_BIN) return process.env.GENOS_BIN;
  const exe = process.platform === 'win32' ? 'genos.exe' : 'genos';
  return path.join(repositoryRoot, 'target', 'debug', exe);
}

function studioBridgeRoot() {
  return process.env.GENOS_STUDIO_ROOT || path.join(repositoryRoot, '.genos-studio');
}

function ensureRoot() {
  const root = studioBridgeRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Runs `genos <args>` with cwd pinned to the bridge root. Resolves with a
 * structured result — never rejects — so controllers can surface exit
 * codes and stderr to the operator.
 */
function runGenos(args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolvePromise) => {
    const bin = resolveGenosBin();
    if (!fs.existsSync(bin)) {
      return resolvePromise({
        ok: false,
        code: 'BIN_NOT_FOUND',
        error: `genos binary not found at ${bin}. Build it with: cargo build -p genos-cli`
      });
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(bin, args, {
      cwd: ensureRoot(),
      env: { ...process.env },
      windowsHide: true
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolvePromise({ ok: false, code: 'TIMEOUT', error: `genos ${args[0]} timed out after ${timeoutMs}ms`, stdout, stderr });
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolvePromise({ ok: false, code: 'SPAWN_FAILED', error: err.message });
      }
    });

    child.on('close', (exitCode) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        let json = null;
        try {
          json = JSON.parse(stdout);
        } catch {}
        resolvePromise({ ok: exitCode === 0, exitCode, stdout, stderr, json });
      }
    });
  });
}

/** Resolves a user-supplied snapshot reference inside the bridge root. */
function resolveInRoot(reference) {
  const root = studioBridgeRoot();
  const resolved = path.resolve(root, reference);
  if (!resolved.startsWith(path.resolve(root))) {
    return null;
  }
  return resolved;
}

module.exports = { runGenos, resolveGenosBin, studioBridgeRoot, ensureRoot, resolveInRoot, repositoryRoot };
