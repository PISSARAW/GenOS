'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sourceTarget } = require('./leanSourceContract');
const { measureEnvironment, leanProcessEnvironment } = require('./leanEnvironment');
const { materializeDependencies, materializedSource } = require('./leanDependencyModules');

function runProcess(executable, args, options = {}) {
  return new Promise((resolve) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      resolve({ exitCode: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
        stdout: String(stdout || ''), stderr: String(stderr || ''), error });
    });
  });
}

function unavailable(reason, extra = {}) {
  return { exitCode: 1, status: 'inconclusive', reason, axioms: null, ...extra };
}

function parseAudit(stdout, target) {
  try {
    const audit = JSON.parse(stdout);
    if (audit.schema !== 'genos.lean-audit/v1' || audit.target !== target
      || !Array.isArray(audit.modules) || !Array.isArray(audit.axioms)
      || audit.axioms.some((item) => typeof item !== 'string')) return null;
    return audit;
  } catch (_) { return null; }
}

async function inspectSource(request, execution) {
  const { executable, directory, target, options } = execution;
  const dependencies = await materializeDependencies(request.dependencyModules || [], directory,
    (name) => runProcess(executable, ['-o', `${name}.olean`, `${name}.lean`], options));
  await fs.promises.writeFile(path.join(directory, 'IncrementalCheck.lean'),
    materializedSource(request.source, dependencies), 'utf8');
  const compiled = await runProcess(executable, ['-o', 'IncrementalCheck.olean', 'IncrementalCheck.lean'], options);
  if (compiled.exitCode !== 0) return unavailable('lean_compilation_failed', compiled);
  const inspected = await runProcess(executable, ['--run', path.join(__dirname, 'leanInspector.lean'),
    'IncrementalCheck', target.name], options);
  const audit = inspected.exitCode === 0 ? parseAudit(inspected.stdout, target.name) : null;
  if (!audit) return unavailable('lean_axiom_audit_failed', { stdout: compiled.stdout,
    stderr: inspected.stderr || inspected.stdout, error: inspected.error });
  const prefix = await runProcess(executable, ['--print-prefix'], options);
  if (prefix.exitCode !== 0) return unavailable('lean_environment_unavailable');
  const measured = await measureEnvironment(prefix.stdout.trim(), { ...audit,
    modules: audit.modules.filter((entry) => !dependencies.includes(entry.name)) });
  if (request.environmentDigest && request.environmentDigest !== measured.environmentDigest) {
    return unavailable('lean_environment_mismatch', { ...measured, axioms: audit.axioms });
  }
  return { ...compiled, ...measured, axioms: audit.axioms, auditedTarget: target.name,
    toolchainVersion: request.toolchainVersion, status: 'checked' };
}

async function executeLeanCheck(request = {}) {
  const target = sourceTarget(request.source);
  if (!target) return unavailable('lean_target_missing');
  const executable = request.leanExecutable || process.env.GENOS_LEAN_EXECUTABLE || 'lean';
  const options = { windowsHide: true, timeout: request.timeoutMs || 90000,
    env: leanProcessEnvironment(), maxBuffer: 4 * 1024 * 1024 };
  const version = await runProcess(executable, ['--version'], options);
  if (version.exitCode !== 0 || !request.toolchainVersion || version.stdout.trim() !== request.toolchainVersion.trim()) {
    return unavailable('lean_toolchain_unavailable_or_mismatch', { toolchainVersion: version.stdout.trim(), stderr: version.stderr });
  }
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'genos-lean-'));
  const env = leanProcessEnvironment(directory);
  try {
    await fs.promises.writeFile(path.join(directory, 'IncrementalCheck.lean'), request.source, 'utf8');
    return await inspectSource(request, { executable, directory, target, options: { ...options, cwd: directory, env } });
  } catch (error) {
    return unavailable('lean_audit_unavailable', { stderr: error.message });
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

module.exports = { executeLeanCheck };
