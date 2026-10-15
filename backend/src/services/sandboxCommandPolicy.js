const SAFE_CARGO_OPTIONS = new Set(['--lib', '--workspace', '--quiet', '--offline', '--all-features']);
const SAFE_ARGUMENT = /^[A-Za-z0-9_./:-]+$/;
const SAFE_NODE_SCRIPT = /^[A-Za-z0-9_./:-]+\.m?js$/;
const NODE_TEST_NAME = /(test|spec|check|verify)/i;
const BASE_COMMANDS = new Set(['npm test', 'npm run check', 'pytest', 'cargo test']);
const MAX_COMMAND_LENGTH = 512;
const MAX_COMMAND_PARTS = 32;

function normalizeSandboxCommand(command) {
  return String(command || '').trim().replace(/\s+/g, ' ');
}

function normalizeAllowedCommands(value) {
  if (!Array.isArray(value)) return null;
  if (value.some((command) => typeof command !== 'string')) return null;
  return [...new Set(value.map(normalizeSandboxCommand).filter(Boolean))];
}

function isAllowedSandboxTestCommand(command) {
  const normalized = normalizeSandboxCommand(command);
  if (!normalized || normalized.length > MAX_COMMAND_LENGTH) return false;
  if (BASE_COMMANDS.has(normalized)) return true;

  // Commandes echo simples pour les tests AEIS (output vérifié).
  const parts = normalized.split(' ');
  if (parts.length > MAX_COMMAND_PARTS) return false;

  if (parts[0] === 'echo') {
    return parts.slice(1).every(arg => SAFE_ARGUMENT.test(arg));
  }

  if (parts[0] === 'npm') {
  return allowedNpmTest(parts);
  }
  if (parts[0] === 'node') {
  return allowedNodeTest(parts);
  }
  return allowedCargoTest(parts);
}

module.exports = { normalizeSandboxCommand, normalizeAllowedCommands, isAllowedSandboxTestCommand };

function allowedNpmTest(parts) {
    if (parts[1] !== 'test' && !(parts[1] === 'run' && parts[2] === 'check')) return false;
    const args = parts.slice(parts[1] === 'test' ? 2 : 3);
    return args.length === 0 || (args[0] === '--' && args.slice(1).length > 0 && args.slice(1).every((argument) => SAFE_ARGUMENT.test(argument)));
}

function allowedCargoTest(parts) {
  if (parts[0] !== 'cargo' || parts[1] !== 'test') return false;
  return parts.slice(2).length > 0 && parts.slice(2).every((option) => {
    if (option.startsWith('--')) return SAFE_CARGO_OPTIONS.has(option);
    return SAFE_ARGUMENT.test(option);
  });
}

function allowedNodeTest(parts) {
  const offset = parts[1] === '--test' ? 2 : 1;
  if (!isRelativeTestScript(parts[offset] || '')) return false;
  return parts.slice(offset + 1).every(isPlainArgument);
}

function isRelativeTestScript(script) {
  if (!SAFE_NODE_SCRIPT.test(script)) return false;
  if (script.startsWith('/') || script.includes('..')) return false;
  if (/^[A-Za-z]:/.test(script)) return false;
  return NODE_TEST_NAME.test(script.split('/').pop());
}

function isPlainArgument(argument) {
  return !argument.startsWith('-') && SAFE_ARGUMENT.test(argument);
}
