const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const SAFE_GENOS_ENV = new Set([
  'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE',
  'LANG', 'LC_ALL', 'NODE_ENV'
]);

function genosEnvironment(root) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (SAFE_GENOS_ENV.has(name) || (name.startsWith('GENOS_') && !/(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|API)/i.test(name))) {
      environment[name] = value;
    }
  }
  return { ...environment, GENOS_STUDIO_ROOT: root, GENOS_ROOT: root };
}

function resolveGenosBin() {
  const exe = process.platform === 'win32' ? 'genos.exe' : 'genos';
  const repoDebug = path.join(repositoryRoot, 'target', 'debug', exe);
  const repoRelease = path.join(repositoryRoot, 'target', 'release', exe);

  if (process.env.GENOS_BIN && fs.existsSync(process.env.GENOS_BIN)) {
    const isLegacySystemInstall = process.env.GENOS_BIN.toLowerCase().includes('program files');
    if (isLegacySystemInstall && (fs.existsSync(repoDebug) || fs.existsSync(repoRelease))) {
      return fs.existsSync(repoDebug) ? repoDebug : repoRelease;
    }
    return process.env.GENOS_BIN;
  }

  if (fs.existsSync(repoDebug)) return repoDebug;
  if (fs.existsSync(repoRelease)) return repoRelease;
  return repoDebug;
}

function studioBridgeRoot(rootOverride = null) {
  return rootOverride || process.env.GENOS_STUDIO_ROOT || path.join(repositoryRoot, '.genos-matrix');
}

function ensureRoot(rootOverride = null) {
  const root = studioBridgeRoot(rootOverride);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function parseCommandLine(commandLine) {
  const state = { args: [], current: '', quote: null };
  const str = String(commandLine);
  for (let i = 0; i < str.length; i++) {
    i += consumeCommandCharacter(state, str[i], str[i + 1]);
  }
  if (state.quote) throw new Error('Unterminated quote in GenOS CLI command.');
  if (state.current) state.args.push(state.current);
  return state.args;
}

module.exports = {
  repositoryRoot,
  SAFE_GENOS_ENV,
  genosEnvironment,
  resolveGenosBin,
  studioBridgeRoot,
  ensureRoot,
  parseCommandLine
};

function consumeCommandCharacter(state, char, nextChar) {
  if (char === '\\') {
    const escaped = escapedCommandCharacter(char, nextChar, state.quote);
    state.current += escaped.value;
    return escaped.advance;
  }
  if (state.quote) {
    if (char === state.quote) state.quote = null;
    else state.current += char;
  } else if (['"', "'"].includes(char)) {
    state.quote = char;
  } else if (/\s/.test(char)) {
    if (state.current) state.args.push(state.current);
    state.current = '';
  } else {
    state.current += char;
  }
  return 0;
}

function escapedCommandCharacter(char, nextChar, quote) {
  if (quote === "'") return { value: char, advance: 0 };
  if (nextChar === '"' || nextChar === '\\' || (quote === null && /\s/.test(nextChar))) {
    return { value: nextChar, advance: 1 };
  }
  return { value: char, advance: 0 };
}
