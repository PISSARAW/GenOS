#!/usr/bin/env node
/** Synchronous Codex PreToolUse policy for isolated GenOS runtimes. */
let raw = '';
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }));
}

function getAllowedCommands() {
  try {
    const parsed = JSON.parse(process.env.GENOS_ALLOWED_COMMANDS_JSON || '[]');
    return normalizeAllowedCommands(parsed) || [];
  } catch {
    return [];
  }
}

function isBashAllowed(tool, command, allowedCommands) {
  return tool !== 'Bash' || allowedCommands.includes(command);
}

function isPatchAllowed(tool) {
  return tool !== 'apply_patch' || /^(1|true)$/i.test(String(process.env.GENOS_ALLOW_FILE_EDITS || ''));
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch {}

  const tool = String(input.tool_name || '');
  const command = normalizeSandboxCommand(input.tool_input?.command || '');
  const allowedCommands = getAllowedCommands();

  if (!isBashAllowed(tool, command, allowedCommands)) {
    deny(`Command is outside the GenOS execution policy: ${command || '<empty>'}`);
    return;
  }
  if (!isPatchAllowed(tool)) {
    deny('File edits are not authorized by the GenOS execution policy.');
  }
});
