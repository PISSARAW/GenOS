'use strict';

/**
 * sandboxExecutor.js
 *
 * Exécute des commandes dans un environnement isolé (sandbox processuel).
 *
 * Respecte les règles :
 * - Env minimal (pas d'héritage de secrets)
 * - Timeout avec terminateChild
 * - Output borné par appendBounded
 * - Whitelist sandboxCommandPolicy
 * - Retourne { command, exitCode, stdout, stderr, durationMs, timedOut }
 */

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const { isAllowedSandboxTestCommand } = require('./sandboxCommandPolicy');

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_OUTPUT_CHARS = 32768;

function buildIsolatedEnv(extra = {}) {
  return {
    PATH: process.env.PATH || '/usr/bin:/bin',
    CI: '1',
    GENOS_ISOLATED_RUNNER: '1',
    ...(process.platform === 'win32'
      ? {
          SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows',
          SystemDrive: process.env.SystemDrive || 'C:',
          PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
          ComSpec: process.env.ComSpec || 'cmd.exe',
          TEMP: os.tmpdir(),
          TMP: os.tmpdir(),
        }
      : {
          TMPDIR: os.tmpdir(),
        }),
    ...extra,
  };
}

/**
 * Valide qu'une commande est dans la whitelist.
 */
function assertAllowed(command) {
  if (!isAllowedSandboxTestCommand(command)) {
    throw new Error(`Command not in sandbox whitelist: ${command}`);
  }
}

/**
 * Exécute une commande dans le répertoire de travail spécifié avec timeout.
 * Retourne un résultat d'exécution complet.
 */
async function runIsolated({ command, cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, env = {}, stdin = null }) {
  const startedAt = Date.now();
  const cmdHash = `sha256:${crypto.createHash('sha256').update(command).digest('hex')}`;

  assertAllowed(command);

  const [program, ...args] = command.split(/\s+/);
  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd,
      env: buildIsolatedEnv(env),
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk, MAX_OUTPUT_CHARS); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk, MAX_OUTPUT_CHARS); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        command,
        commandHash: cmdHash,
        exitCode: -1,
        stdout: '',
        stderr: error.message,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        success: false,
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        commandHash: cmdHash,
        exitCode: code === null && signal ? -1 : (code || 0),
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        success: code === 0 && !timedOut,
      });
    });

    if (stdin) {
      try { child.stdin.write(stdin); } catch (_) {}
    }
    child.stdin.end();
  });
}

module.exports = {
  runIsolated,
  buildIsolatedEnv,
  DEFAULT_TIMEOUT_MS,
};
