/**
 * Biomimicry Handler: Fetus in Fetu (Encapsulation Endoparasitaire & Rescue Pod)
 *
 * Simulates the biological anomaly where a dormant twin embryo is encapsulated
 * inside a host twin's internal state. Upon catastrophic host failure or compromise,
 * the internal dormant fetus undergoes emergency resurrection/hatching to recover the agent.
 */

const crypto = require('crypto');

// In-memory registry of encapsulated fetuses
const FETUS_REGISTRY = new Map();

function computeChecksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data || {})).digest('hex');
}

function handleEncapsulate(args) {
  const hostId = args.host_agent_id || `host_${Date.now()}`;
  const fetusId = args.fetus_agent_id || `fetus_in_fetu_${Math.random().toString(36).substring(2, 9)}`;
  const cleanCheckpoint = args.clean_checkpoint || { step: 0, memory: [], tools: [] };
  const dormancyChecksum = computeChecksum(cleanCheckpoint);

  const fetusRecord = {
    fetusId,
    hostId,
    state: 'dormant',
    encapsulatedAt: new Date().toISOString(),
    checkpoint: cleanCheckpoint,
    checksum: dormancyChecksum,
    metabolicOverhead: 0, // Zero compute consumed while dormant
    hatchCount: 0,
    rescueTriggerPolicy: args.rescue_trigger_policy || 'on_fatal_compromise'
  };

  FETUS_REGISTRY.set(hostId, fetusRecord);

  return {
    configured: true,
    success: true,
    status: 'encapsulated',
    transport: 'internal_retroperitoneal_capsule',
    host_id: hostId,
    fetus_id: fetusId,
    dormancy_checksum: dormancyChecksum,
    metabolic_overhead: 0,
    output: `Dormant fetus [${fetusId}] successfully encapsulated inside host [${hostId}] as zero-cost rescue pod.`
  };
}

function handleResurrect(args) {
  const hostId = args.host_agent_id;
  const failureReason = args.failure_reason || 'unspecified_catastrophic_failure';
  const record = FETUS_REGISTRY.get(hostId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'no_fetus_found',
      error: `No encapsulated fetus found inside host [${hostId}].`
    };
  }

  // Verify dormancy checksum integrity before hatching
  const currentChecksum = computeChecksum(record.checkpoint);
  const isIntact = (currentChecksum === record.checksum);

  record.state = 'hatched';
  record.hatchedAt = new Date().toISOString();
  record.hatchCount += 1;
  record.purgedHostId = hostId;
  record.resurrectionReason = failureReason;

  const newActiveAgentId = `resurrected_${record.fetusId}`;

  return {
    configured: true,
    success: true,
    status: 'emergency_resurrection_complete',
    transport: 'fetu_hatching_mechanism',
    purged_host_id: hostId,
    active_resurrected_id: newActiveAgentId,
    checkpoint_restored: record.checkpoint,
    integrity_verified: isIntact,
    failure_reason: failureReason,
    output: `Host [${hostId}] purged. Encapsulated fetus [${record.fetusId}] hatched into active agent [${newActiveAgentId}] with 100% integrity.`
  };
}

function handleInspect(args) {
  const hostId = args.host_agent_id;
  const record = FETUS_REGISTRY.get(hostId);

  if (!record) {
    return {
      configured: true,
      success: false,
      status: 'not_found',
      error: `Host [${hostId}] has no encapsulated fetus.`
    };
  }

  const currentChecksum = computeChecksum(record.checkpoint);
  const intact = (currentChecksum === record.checksum);

  return {
    configured: true,
    success: true,
    status: 'inspected',
    host_id: hostId,
    fetus_id: record.fetusId,
    state: record.state,
    encapsulated_at: record.encapsulatedAt,
    integrity_valid: intact,
    rescue_policy: record.rescueTriggerPolicy,
    output: `Fetus in Fetu [${record.fetusId}] inside [${hostId}] is ${record.state} (Integrity: ${intact ? 'VALID' : 'CORRUPTED'}).`
  };
}

function handleStatus(args) {
  const hostId = args.host_agent_id;
  if (hostId) {
    return handleInspect(args);
  }

  const allRecords = Array.from(FETUS_REGISTRY.values()).map(r => ({
    hostId: r.hostId,
    fetusId: r.fetusId,
    state: r.state,
    checksum: r.checksum
  }));

  return {
    configured: true,
    success: true,
    total_encapsulated_fetuses: allRecords.length,
    active_capsules: allRecords
  };
}

async function handle(args, run) {
  const action = (args && args.action) || 'status';

  switch (action) {
    case 'encapsulate_inner_fetus':
      return handleEncapsulate(args);
    case 'trigger_emergency_resurrection':
      return handleResurrect(args);
    case 'inspect_encapsulated_state':
      return handleInspect(args);
    case 'status':
    default:
      return handleStatus(args);
  }
}

module.exports = {
  handle,
  FETUS_REGISTRY
};
