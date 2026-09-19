'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runProcess(executable, args, options = {}) {
  return new Promise((resolve) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      resolve({ exitCode: error?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error });
    });
  });
}

function declaredAxioms(source) {
  const matches = String(source).matchAll(/^\s*axiom\s+([\w.']+)/gmu);
  return [...matches].map((match) => match[1]).sort();
}

async function executeSource(request, executable, directory) {
  const sourcePath = path.join(directory, 'IncrementalCheck.lean');
  await fs.promises.writeFile(sourcePath, request.source, 'utf8');
  return runProcess(executable, [sourcePath], { cwd: directory, windowsHide: true, timeout: request.timeoutMs || 30000 });
}

async function executeLeanCheck(request = {}) {
  const executable = request.leanExecutable || 'lean';
  const version = await runProcess(executable, ['--version'], { windowsHide: true, timeout: 10000 });
  if (version.exitCode !== 0 || !version.stdout.includes(request.toolchainVersion)) {
    return { exitCode: version.exitCode || 1, stderr: 'Lean toolchain version mismatch.', toolchainVersion: version.stdout.trim(), axioms: [] };
  }
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'genos-lean-'));
  try {
    const result = await executeSource(request, executable, directory);
    return { ...result, toolchainVersion: request.toolchainVersion, axioms: declaredAxioms(request.source) };
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { declaredAxioms, executeLeanCheck };
