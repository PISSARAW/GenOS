'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const checked = new Set();

function assertReplayCompatible(bin, probe = execFileSync) {
  const stat = fs.statSync(bin);
  const key = `${bin}:${stat.mtimeMs}:${stat.size}`;
  if (checked.has(key)) return;
  let help = '';
  try {
    help = probe(bin, ['replay', 'basic', '--help'], {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (cause) {
    throw incompatible(bin, cause);
  }
  if (!/--snapshot\b/.test(String(help))) throw incompatible(bin);
  checked.add(key);
}

function incompatible(bin, cause) {
  return Object.assign(new Error(`The GenOS CLI at ${bin} does not support replay basic --snapshot. Build cargo build -p genos-cli and configure GENOS_BIN with that executable.`, { cause }), {
    code: 'GENOS_CLI_INCOMPATIBLE'
  });
}

function assertCommandCompatible(bin, args) {
  if (args[0] === 'replay' && args[1] === 'basic') assertReplayCompatible(bin);
}

module.exports = { assertReplayCompatible, assertCommandCompatible };
