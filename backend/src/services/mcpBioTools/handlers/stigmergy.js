const { quoteCliArg, pickArg, pickNumber, hasFlag } = require('../shellQuote');
const { getDatabase } = require('../../../db');
const dynamicOrganization = require('../../dynamicOrganizationService');

async function publishStigmergySignal(args, amount) {
  const orchestratorId = pickArg(args, ['orchestrator_id', 'orchestratorId'], '');
  const agentId = pickArg(args, ['agent_id', 'agentId'], '');
  if (!orchestratorId) return null;
  if (!agentId) throw new Error('agent_id is required when orchestrator_id is provided.');
  const signalData = {
    topic: pickArg(args, ['target_file', 'targetFile'], ''),
    locusHash: pickArg(args, ['target_file', 'targetFile'], ''),
    intensity: Math.min(100, Math.abs(Number.isFinite(Number(amount)) ? Number(amount) : 1)),
    isRepellent: hasFlag(args, ['is_repellent', 'isRepellent']),
    pheromoneType: pickArg(args, ['pheromone_type', 'pheromoneType'], 'trace')
  };
  return dynamicOrganization.publish(await getDatabase(), {
    orchestratorId, senderAgentId: agentId, kind: 'trace', signalType: 'pheromone', signalData
  });
}

function prepareStigmergyCommand(args) {
  const action = String(pickArg(args, ['action'], 'deposit')).toLowerCase();
  const rawTargetFile = String(pickArg(args, ['target_file', 'targetFile'], ''));
  const agentId = quoteCliArg(pickArg(args, ['agent_id', 'agentId'], 'default-agent'));
  const targetFile = quoteCliArg(rawTargetFile);
  const pheromoneType = quoteCliArg(pickArg(args, ['pheromone_type', 'pheromoneType'], 'trace'));

  let cmd;
  if (action === 'read') {
    if (!rawTargetFile) {
      return { action, error: 'target_file is required for stigmergy-read' };
    }
    cmd = `genos biomimicry stigmergy-read --agent-id ${agentId} --target-file ${targetFile}`;
  } else if (action === 'evaporate') {
    cmd = `genos biomimicry stigmergy-evaporate --agent-id ${agentId}`;
    if (args.dt_seconds !== undefined) cmd += ` --dt-seconds ${pickNumber(args.dt_seconds, 1)}`;
  } else {
    if (!rawTargetFile) {
      return { action, error: 'target_file is required for stigmergy-deposit' };
    }
    cmd = `genos biomimicry stigmergy-deposit --agent-id ${agentId} --target-file ${targetFile} --pheromone-type ${pheromoneType}`;
    if (args.amount !== undefined) cmd += ` --amount ${pickNumber(args.amount, 1.0)}`;
    if (hasFlag(args, ['is_repellent', 'isRepellent'])) cmd += ' --is-repellent';
  }
  return { action, command: cmd };
}

async function publishSignalResult(args, action, amount) {
  if (action !== 'deposit' && action !== 'trail') return null;
  try {
    return { signal: await publishStigmergySignal(args, amount) };
  } catch (error) {
    return { error: error.message };
  }
}

async function handleStigmergy(args, run) {
  const prepared = prepareStigmergyCommand(args);
  if (prepared.error) return { configured: true, success: false, status: 'tool_error', transport: 'local', output: prepared.error };
  const output = run(prepared.command).toString();
  const publication = await publishSignalResult(args, prepared.action, args.amount);
  if (publication?.error) return { configured: true, success: true, status: 'completed_signal_error', transport: 'local', signalError: publication.error, output };
  const signal = publication?.signal || null;
  return { configured: true, success: true, status: 'completed', transport: signal ? 'local+zero_text' : 'local', signal, output };
}

function handleStigmergyError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleStigmergy, handleStigmergyError };
