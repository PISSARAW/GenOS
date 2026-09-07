const SAFE_CARGO_OPTIONS = new Set(['--lib', '--workspace', '--quiet', '--offline', '--all-features']);
const SAFE_ARGUMENT = /^[A-Za-z0-9_./:-]+$/;
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
  const parts = normalized.split(' ');
  if (parts.length > MAX_COMMAND_PARTS) return false;
  if (parts[0] === 'npm') {
    if (parts[1] !== 'test' && !(parts[1] === 'run' && parts[2] === 'check')) return false;
    const args = parts.slice(parts[1] === 'test' ? 2 : 3);
    return args.length === 0 || (args[0] === '--' && args.slice(1).length > 0 && args.slice(1).every((argument) => SAFE_ARGUMENT.test(argument)));
  }
  if (parts[0] !== 'cargo' || parts[1] !== 'test') return false;
  return parts.slice(2).length > 0 && parts.slice(2).every((option) => SAFE_CARGO_OPTIONS.has(option) || SAFE_ARGUMENT.test(option));
}

module.exports = { normalizeSandboxCommand, normalizeAllowedCommands, isAllowedSandboxTestCommand };
