function handleSynapticPathEvaluate(args, run) {
  const out = run(`genos synaptic path-evaluate --agent-id ${args.agent_id} --pre-node "${args.pre_node}" --post-node "${args.post_node}"`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleSynapticPathEvaluateError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleSynapticPathEvaluate, handleSynapticPathEvaluateError };
