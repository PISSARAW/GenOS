function handleMyceliumRoute(args, run) {
  const out = run(`genos biomimicry mycelium-route --agent-id ${args.agent_id} --target-path "${args.target_path}"`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleMyceliumRouteError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleMyceliumRoute, handleMyceliumRouteError };
