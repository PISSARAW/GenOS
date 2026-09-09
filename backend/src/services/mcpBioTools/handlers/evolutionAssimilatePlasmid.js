function handleEvolutionAssimilatePlasmid(args, run) {
  const out = run(`genos evolution assimilate-plasmid --agent-id ${args.agent_id} --plasmid-id "${args.plasmid_id}"` + (args.source_agent ? ` --source ${args.source_agent}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEvolutionAssimilatePlasmidError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEvolutionAssimilatePlasmid, handleEvolutionAssimilatePlasmidError };
