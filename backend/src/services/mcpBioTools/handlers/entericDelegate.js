function handleEntericDelegate(args, run) {
  const out = run(`genos biomimicry enteric-delegate --agent-id ${args.agent_id} --data-source "${args.data_source}"` + (args.digestion_mode ? ` --digestion-mode ${args.digestion_mode}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEntericDelegateError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEntericDelegate, handleEntericDelegateError };
