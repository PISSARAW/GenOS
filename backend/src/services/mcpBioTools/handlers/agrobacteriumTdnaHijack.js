// Registry for Agrobacterium T-DNA Hijacking & Opine Resource Redirection
const agrobacteriumRegistry = new Map();

function getInfectionRecord(hostId) {
  if (!agrobacteriumRegistry.has(hostId)) {
    agrobacteriumRegistry.set(hostId, {
      hostId,
      isInfected: false,
      tdnaPayload: null,
      gallusAllocatedTokens: 0,
      opineYieldProduced: 0,
      opinesHarvested: 0,
      updatedAt: new Date().toISOString()
    });
  }
  return agrobacteriumRegistry.get(hostId);
}

function handleInjectTdna(record, hostId, args) {
  const payload = args.tdna_payload || 'T_DNA_OPINE_SYNTHESIS_CROWN_GALL';
  const tokenQuota = args.allocated_tokens || 500;

  record.isInfected = true;
  record.tdnaPayload = payload;
  record.gallusAllocatedTokens += tokenQuota;
  record.opineYieldProduced += Math.floor(tokenQuota * 0.8);
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'tdna_injected_successfully',
    transport: 'agrobacterium_hijack_engine',
    host_id: hostId,
    tdna_payload: payload,
    gallus_allocated_tokens: record.gallusAllocatedTokens,
    opine_yield_produced: record.opineYieldProduced,
    output: `Agrobacterium injected T-DNA into host '${hostId}'. Formed computational gallus with ${tokenQuota} tokens producing ${record.opineYieldProduced} opines.`
  };
}

function handleHarvestOpines(record, hostId) {
  const harvestable = record.opineYieldProduced - record.opinesHarvested;
  record.opinesHarvested += harvestable;
  record.updatedAt = new Date().toISOString();

  return {
    configured: true,
    success: true,
    status: 'opines_harvested',
    transport: 'agrobacterium_hijack_engine',
    host_id: hostId,
    harvested_amount: harvestable,
    total_harvested: record.opinesHarvested,
    output: `Harvested ${harvestable} opines from host '${hostId}' crown gallus (Total: ${record.opinesHarvested}).`
  };
}

function handleAgrobacteriumTdnaHijack(args = {}) {
  const action = args.action || 'status';
  const hostId = args.host_id || 'host-plant-agent-1';
  const record = getInfectionRecord(hostId);

  if (action === 'inject_tdna_payload') {
    return handleInjectTdna(record, hostId, args);
  }
  if (action === 'harvest_opine_resources') {
    return handleHarvestOpines(record, hostId);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'agrobacterium_hijack_engine',
    host_id: hostId,
    is_infected: record.isInfected,
    opine_yield: record.opineYieldProduced,
    opines_harvested: record.opinesHarvested,
    output: `Agrobacterium engine active for '${hostId}': infected=${record.isInfected}, opines=${record.opineYieldProduced}.`
  };
}

function handleAgrobacteriumTdnaHijackError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'agrobacterium_hijack_engine',
    output: e.message || 'Unknown Agrobacterium hijack error'
  };
}

module.exports = {
  handleAgrobacteriumTdnaHijack,
  handleAgrobacteriumTdnaHijackError,
  agrobacteriumRegistry
};
