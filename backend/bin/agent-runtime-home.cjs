const fs = require('fs');
const os = require('os');
const path = require('path');

function cleanup(state) {
  if (state.cleanedUp) return;
  state.cleanedUp = true;
  if (state.latencyTimer) clearTimeout(state.latencyTimer);
  fs.rmSync(state.isolatedRuntimeRoot || state.isolatedCodexHome, { recursive: true, force: true });
}

function setupCodexHome() {
  const hostCodexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const persistentHome = process.env.GENOS_PERSISTENT_CODEX_HOME;
  if (persistentHome && !path.isAbsolute(persistentHome)) {
    throw new Error('GENOS_PERSISTENT_CODEX_HOME must be an absolute path.');
  }
  const configuredRoot = process.env.GENOS_RUNNER_LOG_DIR;
  const runtimeParent = configuredRoot && path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(__dirname, '../..', '.genos-runner-logs');
  fs.mkdirSync(runtimeParent, { recursive: true });
  const isolatedRuntimeRoot = fs.mkdtempSync(path.join(runtimeParent, 'genos-runtime-'));
  const isolatedCodexHome = persistentHome ? path.resolve(persistentHome)
    : path.join(isolatedRuntimeRoot, 'codex-home');
  const isolatedTemp = path.join(isolatedRuntimeRoot, 'tmp');
  fs.mkdirSync(isolatedCodexHome, { recursive: true });
  fs.mkdirSync(isolatedTemp, { recursive: true });
  const hostAuth = path.join(hostCodexHome, 'auth.json');
  const isolatedAuth = path.join(isolatedCodexHome, 'auth.json');
  if (fs.existsSync(hostAuth) && !fs.existsSync(isolatedAuth)) fs.copyFileSync(hostAuth, isolatedAuth);
  const config = '[features]\nhooks = true\n';
  persistReviewedFile(path.join(isolatedCodexHome, 'config.toml'), config, !!persistentHome);
  const policyHook = path.resolve(__dirname, 'genos-pre-tool-policy.cjs');
  const hooks = JSON.stringify({
    description: 'Enforce the execution policy attached to a GenOS mission.',
    hooks: { PreToolUse: [{ matcher: '^(Bash|apply_patch)$', hooks: [{ type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(policyHook)}`, timeout: 10 }] }] }
  });
  persistReviewedFile(path.join(isolatedCodexHome, 'hooks.json'), hooks, !!persistentHome);
  return { home: isolatedCodexHome, root: isolatedRuntimeRoot, temp: isolatedTemp,
    persistent: !!persistentHome };
}

function persistReviewedFile(filePath, content, verifyExisting) {
  if (verifyExisting && fs.existsSync(filePath)) {
    if (fs.readFileSync(filePath, 'utf8') !== content) {
      throw Object.assign(new Error(`Persistent Codex configuration needs review: ${path.basename(filePath)} changed.`),
        { code: 'GENOS_CODEX_HOOK_CONFIGURATION_CHANGED' });
    }
    return;
  }
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

module.exports = { cleanup, setupCodexHome, persistReviewedFile };
