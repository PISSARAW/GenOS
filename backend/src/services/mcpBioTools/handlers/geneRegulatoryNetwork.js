function handleGeneRegulatoryNetwork(args, run) {
  const out = run(`genos biomimicry gene-regulatory-network --agent-id ${args.agent_id} --condition "${args.condition}" --action-script "${args.action_script}"`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleGeneRegulatoryNetworkError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleGeneRegulatoryNetwork, handleGeneRegulatoryNetworkError };
