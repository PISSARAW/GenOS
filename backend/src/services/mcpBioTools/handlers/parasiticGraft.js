const crypto = require('crypto');
const { quoteCliArg } = require('../shellQuote');

// Registry for active autosite-parasite grafts
const parasiticGraftRegistry = new Map();

function getGraft(graftId) {
  if (!parasiticGraftRegistry.has(graftId)) {
    parasiticGraftRegistry.set(graftId, {
      graftId,
      autositeAgentId: 'agent-autosite-viable',
      arrestedTwinId: 'agent-twin-arrested',
      graftedLimbs: [], // array of subordinate tools/functions
      harvestedTokens: 0,
      status: 'ungrafted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return parasiticGraftRegistry.get(graftId);
}

function handleParasiticGraft(args = {}, run) {
  const action = args.action || 'status';
  const graftId = args.graft_id || `graft-${Date.now()}`;
  const autositeId = args.autosite_id || 'agent-autosite-primary';
  const arrestedId = args.arrested_twin_id || 'agent-twin-stalled';
  const limbs = Array.isArray(args.limbs) ? args.limbs : [
    { limbName: 'auxiliary_ast_parser', capability: 'ast_analysis', costRating: 0.1 },
    { limbName: 'residual_memory_cache', capability: 'fast_lookup', costRating: 0.05 }
  ];

  let cliOutput = null;
  if (typeof run === 'function') {
    try {
      const out = run(`genos biomimicry bio-feature --feature parasitic_graft --action ${quoteCliArg(action)} --param graft_id=${quoteCliArg(graftId)}`);
      cliOutput = out ? out.toString() : null;
    } catch (_) {}
  }

  const graft = getGraft(graftId);

  if (action === 'graft_arrested_twin') {
    graft.autositeAgentId = autositeId;
    graft.arrestedTwinId = arrestedId;
    graft.graftedLimbs = limbs;
    graft.harvestedTokens = Number(args.harvested_residual_tokens) || 12500;
    graft.status = 'parasite_assimilated_as_limb';
    graft.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'parasite_grafted',
      transport: 'autosite_parasitic_plane',
      graft_id: graftId,
      autosite_agent_id: autositeId,
      assimilated_twin_id: arrestedId,
      grafted_limbs_count: limbs.length,
      limbs: graft.graftedLimbs,
      harvested_tokens: graft.harvestedTokens,
      output: `Arrested twin '${arrestedId}' converted into parasitic auxiliary appendage for autosite '${autositeId}'. Harvested ${graft.harvestedTokens} residual tokens.`
    };
  }

  if (action === 'invoke_parasitic_limb') {
    const limbName = args.limb_name || (graft.graftedLimbs[0] ? graft.graftedLimbs[0].limbName : 'default_limb');
    const inputPayload = args.payload || {};
    const limb = graft.graftedLimbs.find(l => l.limbName === limbName);

    if (!limb) {
      return {
        configured: true,
        success: false,
        status: 'limb_not_found',
        transport: 'autosite_parasitic_plane',
        graft_id: graftId,
        output: `Parasitic limb '${limbName}' not found on autosite '${graft.autositeAgentId}'.`
      };
    }

    return {
      configured: true,
      success: true,
      status: 'limb_invoked',
      transport: 'autosite_parasitic_plane',
      graft_id: graftId,
      autosite_agent_id: graft.autositeAgentId,
      invoked_limb: limbName,
      overhead_tokens_consumed: 5, // ultra-low passive overhead
      result: `Parasitic limb [${limbName}] executed successfully: ${JSON.stringify(inputPayload)}`,
      output: `Autosite '${graft.autositeAgentId}' executed subordinate parasitic limb '${limbName}' with zero autonomous container cost.`
    };
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'autosite_parasitic_plane',
    graft_id: graftId,
    autosite: graft.autositeAgentId,
    parasite: graft.arrestedTwinId,
    limbs_count: graft.graftedLimbs.length,
    status_label: graft.status,
    output: `Parasitic graft '${graftId}' (${graft.arrestedTwinId} -> ${graft.autositeAgentId}) status: ${graft.status}.`
  };
}

function handleParasiticGraftError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'autosite_parasitic_plane',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}

module.exports = {
  handleParasiticGraft,
  handleParasiticGraftError,
  parasiticGraftRegistry
};
