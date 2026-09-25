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

function payloadFile(text) {
  const name = `genos-payload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const file = path.join(os.tmpdir(), name);
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

module.exports = { payloadFile, toSpawnArgs, loadArgv, FILE_THRESHOLD };
