function handleCellularBBB(args, run) {
  const out = run(`genos biomimicry cellular-bbb --agent-id ${args.agent_id} --filter-level ${args.filter_level}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCellularBBError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCellularBBB, handleCellularBBError };
