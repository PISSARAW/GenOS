const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for active conjoined twin pairs
const conjoinedTwinRegistry = new Map();

function getPair(pairId) {
  if (!conjoinedTwinRegistry.has(pairId)) {
    conjoinedTwinRegistry.set(pairId, {
      pairId,
      twinA: 'agent-twin-A',
      twinB: 'agent-twin-B',
      sharedOrgans: ['shared_token_pool', 'thalamic_sensory_bridge', 'atomic_io_lock'],
      sharedTokenPool: 50000,
      vitalCouplingScore: 1.0,
      status: 'unbound',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return conjoinedTwinRegistry.get(pairId);
}

function handleConjoinedTwinBind(args = {}, run) {
  const action = args.action || 'status';
  const pairId = args.pair_id || `conjoined-pair-${Date.now()}`;
  const twinA = args.twin_a || 'agent-core-A';
  const twinB = args.twin_b || 'agent-core-B';
  const initialPool = Number(args.shared_tokens) || 50000;
  const organs = Array.isArray(args.shared_organs) ? args.shared_organs : ['shared_token_pool', 'thalamic_sensory_bridge', 'atomic_io_lock'];

  let cliOutput = null;
  if (typeof run === 'function') {
    try {
      const out = run(`genos biomimicry bio-feature --feature conjoined_twin --action ${quoteCliArg(action)} --param pair_id=${quoteCliArg(pairId)}`);
      cliOutput = out ? out.toString() : null;
    } catch (_) {}
  }

  const pair = getPair(pairId);

  if (action === 'bind_conjoined_twins') {
    pair.twinA = twinA;
    pair.twinB = twinB;
    pair.sharedOrgans = organs;
    pair.sharedTokenPool = initialPool;
    pair.vitalCouplingScore = 0.98;
    pair.status = 'conjoined_visceral_link_active';
    pair.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'twins_conjoined',
      transport: 'visceral_conjoined_plane',
      pair_id: pairId,
      twins: [twinA, twinB],
      shared_organs: organs,
      shared_token_pool: pair.sharedTokenPool,
      vital_coupling_score: pair.vitalCouplingScore,
      output: `Conjoined visceral bond established between '${twinA}' and '${twinB}'. Shared organs: ${organs.join(', ')}.`
    };
  }

  if (action === 'transfuse_shared_resource') {
    const amount = Number(args.amount) || 1000;
    const recipient = args.recipient === twinB ? twinB : twinA;
    
    if (pair.sharedTokenPool < amount) {
      return {
        configured: true,
        success: false,
        status: 'vital_depletion',
        transport: 'visceral_conjoined_plane',
        pair_id: pairId,
        available_pool: pair.sharedTokenPool,
        output: `Transfusion rejected: shared visceral token pool depleted (${pair.sharedTokenPool} < ${amount}).`
      };
    }

    pair.sharedTokenPool -= amount;
    pair.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'transfusion_complete',
      transport: 'visceral_conjoined_plane',
      pair_id: pairId,
      recipient,
      amount_transfused: amount,
      remaining_shared_pool: pair.sharedTokenPool,
      output: `Transfused ${amount} tokens to conjoined twin '${recipient}'. Remaining pool: ${pair.sharedTokenPool}.`
    };
  }

  if (action === 'sever_conjoined_bind') {
    if (args.force !== true && pair.vitalCouplingScore > 0.5) {
      return {
        configured: true,
        success: false,
        status: 'separation_surgery_high_risk',
        transport: 'visceral_conjoined_plane',
        pair_id: pairId,
        vital_coupling_score: pair.vitalCouplingScore,
        output: `Surgical separation blocked: vital coupling score is ${pair.vitalCouplingScore}. Set force=true or decouple shared organs first.`
      };
    }

    pair.status = 'surgically_separated';
    pair.vitalCouplingScore = 0.0;
    pair.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'surgically_separated',
      transport: 'visceral_conjoined_plane',
      pair_id: pairId,
      output: `Conjoined twins '${pair.twinA}' and '${pair.twinB}' separated successfully into autonomous independent entities.`
    };
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'visceral_conjoined_plane',
    pair_id: pairId,
    twins: [pair.twinA, pair.twinB],
    shared_pool: pair.sharedTokenPool,
    vital_coupling: pair.vitalCouplingScore,
    status_label: pair.status,
    output: `Conjoined pair '${pairId}' (${pair.twinA} <-> ${pair.twinB}) status: ${pair.status}.`
  };
}

function handleConjoinedTwinBindError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'visceral_conjoined_plane',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}

module.exports = {
  handleConjoinedTwinBind,
  handleConjoinedTwinBindError,
  conjoinedTwinRegistry
};
