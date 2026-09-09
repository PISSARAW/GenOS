function handleTelomereFork(args, run) {
  const targetId = args.agent_id || args.parent_id || 'root_agent';
  const cmd = `genos biomimicry telomere-fork --agent-id ${targetId}` + (args.force_telomerase ? ` --force-telomerase` : '');
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleTelomereForkError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleTelomereFork, handleTelomereForkError };
