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
  const configuredRoot = process.env.GENOS_RUNNER_LOG_DIR;
  const runtimeParent = configuredRoot && path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(__dirname, '../..', '.genos-runner-logs');
  fs.mkdirSync(runtimeParent, { recursive: true });
  const isolatedRuntimeRoot = fs.mkdtempSync(path.join(runtimeParent, 'genos-runtime-'));
  const isolatedCodexHome = path.join(isolatedRuntimeRoot, 'codex-home');
  const isolatedTemp = path.join(isolatedRuntimeRoot, 'tmp');
  fs.mkdirSync(isolatedCodexHome, { recursive: true });
  fs.mkdirSync(isolatedTemp, { recursive: true });
  const hostAuth = path.join(hostCodexHome, 'auth.json');
  if (fs.existsSync(hostAuth)) fs.copyFileSync(hostAuth, path.join(isolatedCodexHome, 'auth.json'));
  fs.writeFileSync(path.join(isolatedCodexHome, 'config.toml'), '[features]\nhooks = true\n', { mode: 0o600 });
  const policyHook = path.resolve(__dirname, 'genos-pre-tool-policy.cjs');
  fs.writeFileSync(path.join(isolatedCodexHome, 'hooks.json'), JSON.stringify({
    description: 'Enforce the execution policy attached to a GenOS mission.',
    hooks: { PreToolUse: [{ matcher: '^(Bash|apply_patch)$', hooks: [{ type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(policyHook)}`, timeout: 10 }] }] }
  }), { mode: 0o600 });
  return { home: isolatedCodexHome, root: isolatedRuntimeRoot, temp: isolatedTemp };
}

module.exports = { cleanup, setupCodexHome };
