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
const path = require('node:path');
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

function commandInvocation(command) {
  const [commandName, ...commandArgs] = command.split(/\s+/);
  if (commandName === 'npm') {
    if (process.platform !== 'win32') return { program: 'npm', args: commandArgs };
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return { program: process.execPath, args: [npmCli, ...commandArgs] };
  }
  if (commandName === 'node') return { program: process.execPath, args: commandArgs };
  if (commandName === 'cargo') return { program: 'cargo', args: commandArgs };
  if (commandName === 'pytest') return { program: 'pytest', args: commandArgs };
  if (commandName === 'echo') return { program: process.execPath, args: ['-e', 'process.stdout.write(process.argv.slice(1).join(" "))', ...commandArgs] };
  throw new Error('Command not in sandbox whitelist.');
}

/**
 * Exécute une commande dans le répertoire de travail spécifié avec timeout.
 * Retourne un résultat d'exécution complet.
 */
async function runIsolated({ command, cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, env = {}, stdin = null, identity = {} }) {
  const startedAt = Date.now();
  const executionId = crypto.randomUUID();
  const cmdHash = `sha256:${crypto.createHash('sha256').update(command).digest('hex')}`;

  assertAllowed(command);

  const invocation = commandInvocation(command);
  return new Promise((resolve) => {
    const child = spawn(invocation.program, invocation.args, {
      cwd,
      env: buildIsolatedEnv(env),
      shell: false,
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
        executionId, processId: child.pid || null, executionIdentity: identity,
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
      const effectiveExitCode = timedOut || code === null ? -1 : code;
      resolve({
        command,
        commandHash: cmdHash,
        executionId, processId: child.pid || null,
        exitCode: effectiveExitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        success: effectiveExitCode === 0 && !timedOut,
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
