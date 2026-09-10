function handleStigmergy(args, run) {
  const action = String(args.action || 'deposit').toLowerCase();
  const agentId = String(args.agent_id || args.agentId || 'default-agent').replace(/["\r\n]/g, '');
  const targetFile = String(args.target_file || args.targetFile || '').replace(/["\r\n]/g, '');
  const pheromoneType = String(args.pheromone_type || args.pheromoneType || 'trace').replace(/["\r\n]/g, '');

  let cmd;
  if (action === 'read') {
    if (!targetFile) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'target_file is required for stigmergy-read' };
    }
    cmd = `genos biomimicry stigmergy-read --agent-id ${agentId} --target-file "${targetFile}"`;
  } else if (action === 'evaporate') {
    cmd = `genos biomimicry stigmergy-evaporate --agent-id ${agentId}`;
    if (args.dt_seconds !== undefined) cmd += ` --dt-seconds ${Number(args.dt_seconds) || 1}`;
  } else {
    if (!targetFile) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'target_file is required for stigmergy-deposit' };
    }
    cmd = `genos biomimicry stigmergy-deposit --agent-id ${agentId} --target-file "${targetFile}" --pheromone-type "${pheromoneType}"`;
    if (args.amount !== undefined) cmd += ` --amount ${Number(args.amount) || 1.0}`;
    if (args.is_repellent || args.isRepellent) cmd += ` --is-repellent`;
  }
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleStigmergyError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleStigmergy, handleStigmergyError };
