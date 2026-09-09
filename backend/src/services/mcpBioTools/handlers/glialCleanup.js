function handleGlialCleanup(args, run) {
  const out = run(`genos biomimicry glial-cleanup --agent-id ${args.agent_id}` + (args.intensity ? ` --intensity ${args.intensity}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleGlialCleanupError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleGlialCleanup, handleGlialCleanupError };
