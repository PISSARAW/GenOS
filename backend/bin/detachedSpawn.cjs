'use strict';

/**
 * @file detachedSpawn.cjs
 * @description Payload-file transport for detached runners. Windows splits a
 * JSON argument on spaces when cmd.exe is involved, so payloads above
 * FILE_THRESHOLD travel via a temp file and the child reads --payload-file.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE_THRESHOLD = 15000;

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
