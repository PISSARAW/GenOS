const { quoteCliArg, pickArg, pickNumber, hasFlag } = require('../shellQuote');

function handleStigmergy(args, run) {
  const action = String(pickArg(args, ['action'], 'deposit')).toLowerCase();
  const rawTargetFile = String(pickArg(args, ['target_file', 'targetFile'], ''));
  const agentId = quoteCliArg(pickArg(args, ['agent_id', 'agentId'], 'default-agent'));
  const targetFile = quoteCliArg(rawTargetFile);
  const pheromoneType = quoteCliArg(pickArg(args, ['pheromone_type', 'pheromoneType'], 'trace'));

  let cmd;
  if (action === 'read') {
    if (!rawTargetFile) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'target_file is required for stigmergy-read' };
    }
    cmd = `genos biomimicry stigmergy-read --agent-id ${agentId} --target-file ${targetFile}`;
  } else if (action === 'evaporate') {
    cmd = `genos biomimicry stigmergy-evaporate --agent-id ${agentId}`;
    if (args.dt_seconds !== undefined) cmd += ` --dt-seconds ${pickNumber(args.dt_seconds, 1)}`;
  } else {
    if (!rawTargetFile) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'target_file is required for stigmergy-deposit' };
    }
    cmd = `genos biomimicry stigmergy-deposit --agent-id ${agentId} --target-file ${targetFile} --pheromone-type ${pheromoneType}`;
    if (args.amount !== undefined) cmd += ` --amount ${pickNumber(args.amount, 1.0)}`;
    if (hasFlag(args, ['is_repellent', 'isRepellent'])) cmd += ' --is-repellent';
  }
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleStigmergyError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleStigmergy, handleStigmergyError };
