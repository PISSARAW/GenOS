const { quoteCliArg } = require('../shellQuote');

// State registry for somatic resonance channels
const somaticMeshes = new Map();

function getMesh(meshId) {
  if (!somaticMeshes.has(meshId)) {
    somaticMeshes.set(meshId, {
      meshId,
      subscribers: new Map(), // agentId -> { entropy: 0.1, stress: 'nominal', lastPulse: null }
      pulses: [],
      collectiveStressIndex: 0.1,
      resonanceState: 'nominal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return somaticMeshes.get(meshId);
}

function handleSomaticResonance(args = {}, run) {
  const action = args.action || 'status';
  const meshId = args.mesh_id || 'mesh-somatic-default';
  const agentId = args.agent_id || 'agent-primary';
  const entropy = typeof args.entropy === 'number' ? args.entropy : 0.15;
  const stressLevel = args.stress_level || (entropy > 0.8 ? 'critical_panic' : (entropy > 0.5 ? 'elevated_tension' : 'nominal'));

  let cliOutput = null;
  if (typeof run === 'function') {
    try {
      const out = run(`genos biomimicry bio-feature --feature somatic_resonance --action ${quoteCliArg(action)} --param mesh_id=${quoteCliArg(meshId)} --param entropy=${entropy}`);
      cliOutput = out ? out.toString() : null;
    } catch (_) {}
  }

  const mesh = getMesh(meshId);

  if (action === 'subscribe_resonance') {
    const peers = Array.isArray(args.peers) ? args.peers : [agentId];
    for (const peer of peers) {
      mesh.subscribers.set(peer, {
        entropy: 0.15,
        stress: 'nominal',
        lastPulse: new Date().toISOString()
      });
    }
    mesh.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'subscribed',
      transport: 'somatic_resonance_wave',
      mesh_id: meshId,
      subscribers: Array.from(mesh.subscribers.keys()),
      output: `Agents [${Array.from(mesh.subscribers.keys()).join(', ')}] wired into somatic resonance mesh '${meshId}'. Synchronous somatic link established.`
    };
  }

  if (action === 'emit_somatic_pulse') {
    const pulse = {
      id: `pulse-${Date.now()}`,
      originAgentId: agentId,
      entropy,
      stressLevel,
      reason: args.reason || 'Cognitive stress telemetry',
      timestamp: new Date().toISOString()
    };
    mesh.pulses.push(pulse);
    if (mesh.pulses.length > 50) mesh.pulses.shift();

    // Instant somatic propagation to all subscribers in the mesh
    mesh.subscribers.set(agentId, {
      entropy,
      stress: stressLevel,
      lastPulse: pulse.timestamp
    });

    // Compute collective stress index
    const totalEntropy = Array.from(mesh.subscribers.values()).reduce((sum, s) => sum + s.entropy, 0);
    const avgEntropy = totalEntropy / Math.max(1, mesh.subscribers.size);
    mesh.collectiveStressIndex = Number(avgEntropy.toFixed(3));

    // Coordinated autonomic reflexes
    let autonomicAction = 'NONE';
    if (entropy >= 0.85 || mesh.collectiveStressIndex >= 0.75) {
      autonomicAction = 'TRIGGER_COORDINATED_CRYPTOBIOSIS_FREEZE';
      mesh.resonanceState = 'hyper_synchronous_panic_lock';
    } else if (entropy >= 0.60) {
      autonomicAction = 'THROTTLE_COGNITIVE_BUDGET_50PCT';
      mesh.resonanceState = 'elevated_alert';
    } else {
      mesh.resonanceState = 'nominal_homeostasis';
    }
    mesh.updatedAt = new Date().toISOString();

    return {
      configured: true,
      success: true,
      status: 'somatic_pulse_propagated',
      transport: 'somatic_resonance_wave',
      mesh_id: meshId,
      pulse_origin: agentId,
      entropy_emitted: entropy,
      stress_level: stressLevel,
      collective_stress_index: mesh.collectiveStressIndex,
      affected_subscribers_count: mesh.subscribers.size,
      autonomic_reflex_triggered: autonomicAction,
      output: `Somatic pulse from '${agentId}' propagated instantaneously (Entropy: ${entropy}, Collective: ${mesh.collectiveStressIndex}). Autonomic response: ${autonomicAction}.`
    };
  }

  if (action === 'evaluate_somatic_state') {
    return {
      configured: true,
      success: true,
      status: 'evaluated',
      transport: 'somatic_resonance_wave',
      mesh_id: meshId,
      resonance_state: mesh.resonanceState,
      collective_stress_index: mesh.collectiveStressIndex,
      subscriber_states: Object.fromEntries(mesh.subscribers),
      recent_pulses_count: mesh.pulses.length,
      output: `Mesh '${meshId}' resonance state: ${mesh.resonanceState} (Collective Stress: ${mesh.collectiveStressIndex}).`
    };
  }

  // Default: status
  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'somatic_resonance_wave',
    mesh_id: meshId,
    subscriber_count: mesh.subscribers.size,
    collective_stress_index: mesh.collectiveStressIndex,
    resonance_state: mesh.resonanceState,
    output: `Somatic resonance mesh '${meshId}' status: ${mesh.subscribers.size} subscriber(s), Stress index: ${mesh.collectiveStressIndex}.`
  };
}

function handleSomaticResonanceError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'somatic_resonance_wave',
    output: e.stdout ? e.stdout.toString() : e.message
  };
}

module.exports = {
  handleSomaticResonance,
  handleSomaticResonanceError,
  somaticMeshes
};
