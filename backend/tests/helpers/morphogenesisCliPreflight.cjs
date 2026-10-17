'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveGenosBin } = require('../../src/services/genosCliEnv');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');

function localBinary() {
  return path.join(REPOSITORY_ROOT, 'target', 'debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
}

function supportsMorphogenesisAuthority(binary) {
  if (!binary || !fs.existsSync(binary)) return false;
  const probe = spawnSync(binary, ['--help'], { encoding: 'utf8', timeout: 10000,
    windowsHide: true });
  return probe.status === 0
    && `${probe.stdout || ''}\n${probe.stderr || ''}`.includes('morphogenesis-adjudicate');
}

function buildLocalBinary() {
  const result = spawnSync('cargo', ['build', '-p', 'genos-cli', '-j', '1'], {
    cwd: REPOSITORY_ROOT, stdio: 'inherit', windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`Unable to build the authenticated morphogenesis CLI (cargo exit ${result.status}).`);
  }
}

function ensureMorphogenesisCli() {
  const configured = resolveGenosBin();
  if (supportsMorphogenesisAuthority(configured)) return configured;
  buildLocalBinary();
  const local = localBinary();
  if (!supportsMorphogenesisAuthority(local)) {
    throw new Error('The freshly built GenOS CLI does not expose morphogenesis-adjudicate.');
  }
  return local;
}

module.exports = { ensureMorphogenesisCli, supportsMorphogenesisAuthority };
