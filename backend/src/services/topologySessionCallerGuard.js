'use strict';

const MUTATIONS = new Set(['apply', 'branch', 'promote', 'variant']);

async function guardTopologyCall(db, record, args, context = {}) {
  if (record.topology !== 'syncytium') return args;
  const operation = String(args.operation || '').toLowerCase();
  if (record.state?.variantPolicy?.runtimeMode === 'specialized'
    && ['apply', 'branch', 'promote'].includes(operation)) {
    throw denied('Specialized variant sessions require a typed variant action.');
  }
  const callerId = context.agentId || process.env.GENOS_AGENT_ID;
  if (!callerId) {
    if (operation === 'variant') throw denied('Variant mutations require an authenticated caller.');
    return args;
  }
  const agent = await db.get('SELECT execution_mode, metadata_json FROM agents WHERE id = ?', callerId);
  if (!agent) throw denied('Unknown topology caller.');
  if (agent.execution_mode === 'worker') assertWorkerSession(agent, record, callerId);
  if (!MUTATIONS.has(operation)) return args;
  return bindCaller(args, callerId);
}

function assertWorkerSession(agent, record, callerId) {
  let metadata;
  try { metadata = JSON.parse(agent.metadata_json || '{}'); } catch { throw denied('Invalid worker identity.'); }
  if (metadata.topologySessionId !== record.id) {
    throw denied(`Worker '${callerId}' is outside this topology session.`);
  }
}

function bindCaller(args, callerId) {
  const output = { ...args };
  if (args.op) output.op = bindActor(args.op, callerId);
  if (args.transaction) output.transaction = {
    ...args.transaction,
    operations: (args.transaction.operations || []).map((item) => bindActor(item, callerId))
  };
  if (args.variant_input) {
    const input = bindActor(args.variant_input, callerId);
    output.variant_input = {
      ...input,
      o: bindActor(input.o || {}, callerId),
      options: bindActor(input.options || {}, callerId),
      ...(input.change ? { change: bindActor(input.change, callerId) } : {}),
      ...(input.result ? { result: bindActor(input.result, callerId) } : {}),
      ...(input.build ? { build: bindActor(input.build, callerId) } : {}),
      ...(input.operation ? { operation: bindActor(input.operation, callerId) } : {}),
      ...(input.operations ? { operations: input.operations.map((item) => bindActor(item, callerId)) } : {}),
      ...(input.transaction ? { transaction: {
        ...input.transaction,
        operations: (input.transaction.operations || []).map((item) => bindActor(item, callerId))
      } } : {})
    };
  }
  return output;
}

function bindActor(value, callerId) {
  if (value.actorId !== undefined && value.actorId !== callerId) throw denied('Actor identity does not match authenticated caller.');
  return { ...value, actorId: callerId };
}

function denied(message) {
  return Object.assign(new Error(message), { code: 'TOPOLOGY_CALLER_DENIED' });
}

module.exports = { guardTopologyCall };
