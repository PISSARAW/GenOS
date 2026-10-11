'use strict';

/**
 * @file detachedSpawn.cjs
 * @description Payload-file transport for detached runners. Windows splits a
 * JSON argument on spaces when cmd.exe is involved, so payloads above
 * FILE_THRESHOLD travel via a temp file. MCP continuations use stdin.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE_THRESHOLD = 15000;
const STDIN_LIMIT = 1024 * 1024;

function readStdinPayload() {
  const chunks = [];
  const buffer = Buffer.alloc(65536);
  let size = 0;
  while (size <= STDIN_LIMIT) {
    const count = fs.readSync(0, buffer, 0, Math.min(buffer.length, STDIN_LIMIT + 1 - size), null);
    if (count === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, count)));
    size += count;
  }
  if (size > STDIN_LIMIT) throw new Error('Payload from stdin exceeds 1 MiB.');
  return Buffer.concat(chunks, size).toString('utf8');
}

function runtimeDirectory() {
  const configured = process.env.GENOS_RUNNER_LOG_DIR;
  if (process.platform !== 'win32') {
    return configured || path.join(os.tmpdir(), 'genos-runner-logs');
  }
  if (configured && path.win32.isAbsolute(configured)) return configured;
  return path.join(process.cwd(), '.genos-runner-logs');
}

function payloadFile(text, directory = runtimeDirectory()) {
  const name = `genos-payload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  fs.writeFileSync(file, String(text), 'utf8');
  return file;
}

function toSpawnArgs(text) {
  const body = String(text);
  if (body.length <= FILE_THRESHOLD) return [body];
  return ['--payload-file', payloadFile(body)];
}

function loadArgv(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--payload-stdin')) return readStdinPayload();
  const flag = args.indexOf('--payload-file');
  if (flag === -1) return null;
  const file = args[flag + 1];
  const body = fs.readFileSync(file, 'utf8');
  try {
    fs.unlinkSync(file);
  } catch (_) {
    /* best-effort cleanup */
  }
  return body;
}

function openRunnerStdio(processId) {
  const directory = runtimeDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const safeId = String(processId).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fd = fs.openSync(path.join(directory, `${safeId}.log`), 'a');
  return { stdio: ['ignore', fd, fd], close: () => fs.closeSync(fd) };
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
}

module.exports = { payloadFile, toSpawnArgs, loadArgv, openRunnerStdio, waitForSpawn, runtimeDirectory, FILE_THRESHOLD };
