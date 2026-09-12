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

const MAX_COMMAND_LINE_LENGTH = 32768;

function parseCommandLine(commandLine) {
  const args = [];
  let current = '';
  let quote = null;
  const str = String(commandLine || '').slice(0, MAX_COMMAND_LINE_LENGTH);
  const len = Math.min(str.length, MAX_COMMAND_LINE_LENGTH);
  for (let i = 0; i < len; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (char === '\\') {
      if (quote === "'") {
        current += char;
      } else if (nextChar === '"' || nextChar === '\\' || (quote === null && /\s/.test(nextChar))) {
        current += nextChar;
        i++;
      } else {
        current += char;
      }
    } else if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (quote) throw new Error('Unterminated quote in GenOS CLI command.');
  if (current) args.push(current);
  return args;
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
