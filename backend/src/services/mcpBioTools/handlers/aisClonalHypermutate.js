function handleAISClonalHypermutate(args, run) {
  const out = run(`genos ais clonal-hypermutate --agent-id ${args.agent_id} --mutation-rate ${args.mutation_rate} --clone-count ${args.clone_count}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleAISClonalHypermutateError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleAISClonalHypermutate, handleAISClonalHypermutateError };
