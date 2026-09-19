const { quoteCliArg } = require('../shellQuote');
const { getDatabase } = require('../../../db');
const dynamicOrganization = require('../../dynamicOrganizationService');

function boundedIdentifier(value, field) {
  const identifier = String(value || '').trim();
  if (!identifier || identifier.length > 128 || /[\u0000-\u001f\u007f]/.test(identifier)) {
    throw new Error(`${field} must be a non-empty identifier of at most 128 characters.`);
  }
  return identifier;
}

async function organizationContext(args) {
  const orchestratorId = args.orchestrator_id;
  if (!orchestratorId) return null;
  const owner = boundedIdentifier(orchestratorId, 'orchestrator_id');
  const agentId = boundedIdentifier(args.agent_id, 'agent_id');
  const plasmidId = boundedIdentifier(args.plasmid_id, 'plasmid_id');
  const db = await getDatabase();
  const authorized = agentId === owner
    ? await db.get("SELECT id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", owner)
    : await db.get("SELECT id FROM agents WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker'", agentId, owner);
  if (!authorized) throw new Error('agent_id must belong to orchestrator_id before plasmid assimilation.');
  return { db, orchestratorId: owner, agentId, plasmidId };
}

async function publishAssimilation(context, args) {
  return dynamicOrganization.publish(context.db, {
    orchestratorId: context.orchestratorId,
    senderAgentId: context.agentId,
    kind: 'success',
    signalType: 'plasmid',
    signalData: {
      operation: 'assimilated',
      plasmidId: context.plasmidId,
      recipientAgentId: context.agentId
    }
  });
}

async function handleEvolutionAssimilatePlasmid(args = {}, run) {
  const context = await organizationContext(args);
  const command = `genos evolution assimilate-plasmid --agent-id ${quoteCliArg(args.agent_id)} --plasmid-id ${quoteCliArg(args.plasmid_id)}` + (args.source_agent ? ` --source ${quoteCliArg(args.source_agent)}` : '');
  const output = run(command).toString();
  if (!context) return { configured: true, success: true, status: 'completed', transport: 'local', output };
  try {
    const signal = await publishAssimilation(context, args);
    return { configured: true, success: true, status: 'completed', transport: 'local+zero_text', signal, output };
  } catch (error) {
    return { configured: true, success: true, status: 'completed_signal_error', transport: 'local', signalError: error.message, output };
  }
}

function handleEvolutionAssimilatePlasmidError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEvolutionAssimilatePlasmid, handleEvolutionAssimilatePlasmidError };
