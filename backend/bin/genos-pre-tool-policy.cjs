#!/usr/bin/env node
/** Synchronous Codex PreToolUse policy for isolated GenOS runtimes. */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch {}

  const deny = (reason) => process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }));
  const tool = String(input.tool_name || '');
  const command = String(input.tool_input?.command || '').trim();
  let allowedCommands = [];
  try {
    const parsed = JSON.parse(process.env.GENOS_ALLOWED_COMMANDS_JSON || '[]');
    if (Array.isArray(parsed)) allowedCommands = parsed.map((value) => String(value).trim()).filter(Boolean);
  } catch {}

  if (tool === 'Bash' && !allowedCommands.includes(command)) {
    deny(`Command is outside the GenOS execution policy: ${command || '<empty>'}`);
    return;
  }
  if (tool === 'apply_patch' && !/^(1|true)$/i.test(String(process.env.GENOS_ALLOW_FILE_EDITS || ''))) {
    deny('File edits are not authorized by the GenOS execution policy.');
  }
});
