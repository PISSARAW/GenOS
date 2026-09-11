/**
 * @file tardigradeDsupShield.js
 * @description Biomimetic handler for Tardigrade Damage Suppressor (Dsup) Shield.
 * Physically coats critical agent genome loci, core prompts and invariants to absorb and
 * suppress radiation, adversarial mutations, and cosmic drift without halting transcription.
 */

'use strict';

const dsupRegistry = new Map();

function initDsupState(targetId, loci, options = {}) {
  const density = typeof options.shield_density === 'number' ? options.shield_density : 0.95;
  const energy = typeof options.shield_energy === 'number' ? options.shield_energy : 100.0;
  return {
    target_id: targetId,
    deployed_at: new Date().toISOString(),
    shield_density: Math.max(0.1, Math.min(1.0, density)),
    shield_energy: Math.max(0, energy),
    max_energy: Math.max(10, energy),
    protected_loci: Array.isArray(loci) && loci.length > 0 ? loci : ['LOCUS_KERNEL_INTEGRITY', 'LOCUS_AUTH_INVARIANTS'],
    absorbed_mutations_count: 0,
    blocked_attacks: [],
    transcription_transparency: 0.99
  };
}

function deployDsupShield(params) {
  const targetId = params.target_id || params.agent_id || 'agent-tardigrade-default';
  const loci = params.protected_loci || ['LOCUS_KERNEL_INTEGRITY', 'LOCUS_AUTH_INVARIANTS', 'LOCUS_CORE_POLICY'];
  const state = initDsupState(targetId, loci, params);
  dsupRegistry.set(targetId, state);

  return {
    success: true,
    action: 'deploy_dsup_shield',
    target_id: targetId,
    shield_density: state.shield_density,
    shield_energy: state.shield_energy,
    protected_loci: state.protected_loci,
    transcription_transparency: state.transcription_transparency,
    message: `Dsup shield successfully enveloped ${state.protected_loci.length} loci on target ${targetId}.`
  };
}

function evaluateAbsorption(state, targetLocus, intensity) {
  const isProtected = state.protected_loci.includes(targetLocus);
  if (!isProtected) {
    return { absorbed: false, reason: 'unprotected_locus', energy_consumed: 0, residual_damage: intensity };
  }
  const protectionPower = state.shield_energy * state.shield_density;
  if (protectionPower >= intensity) {
    const energyCost = intensity * (1.0 - state.shield_density * 0.5);
    state.shield_energy = Math.max(0, state.shield_energy - energyCost);
    state.absorbed_mutations_count += 1;
    return { absorbed: true, energy_consumed: energyCost, residual_damage: 0 };
  }
  const residual = intensity - protectionPower;
  state.shield_energy = 0;
  state.absorbed_mutations_count += 1;
  return { absorbed: false, reason: 'shield_depleted', energy_consumed: protectionPower, residual_damage: residual };
}

function interceptMutationAttempt(params) {
  const targetId = params.target_id || params.agent_id || 'agent-tardigrade-default';
  const state = dsupRegistry.get(targetId);
  if (!state) {
    return { success: false, error: `No active Dsup shield deployed on ${targetId}` };
  }
  const targetLocus = params.target_locus || 'LOCUS_KERNEL_INTEGRITY';
  const attackVector = params.attack_vector || 'cosmic_ray_prompt_injection';
  const intensity = typeof params.mutation_intensity === 'number' ? params.mutation_intensity : 25.0;

  const res = evaluateAbsorption(state, targetLocus, intensity);
  const event = {
    timestamp: new Date().toISOString(),
    target_locus: targetLocus,
    attack_vector: attackVector,
    intensity,
    absorbed: res.absorbed,
    residual_damage: res.residual_damage
  };
  state.blocked_attacks.push(event);

  return {
    success: true,
    action: 'intercept_mutation_attempt',
    target_id: targetId,
    target_locus: targetLocus,
    attack_vector: attackVector,
    mutation_suppressed: res.absorbed,
    residual_damage: res.residual_damage,
    remaining_shield_energy: state.shield_energy,
    total_absorbed: state.absorbed_mutations_count
  };
}

function inspectDsupStatus(params) {
  const targetId = params.target_id || params.agent_id || 'agent-tardigrade-default';
  const state = dsupRegistry.get(targetId);
  if (!state) {
    return { success: true, active: false, message: `No shield active for ${targetId}` };
  }
  return {
    success: true,
    active: true,
    target_id: targetId,
    shield_density: state.shield_density,
    shield_energy: state.shield_energy,
    max_energy: state.max_energy,
    protected_loci: state.protected_loci,
    absorbed_mutations_count: state.absorbed_mutations_count,
    blocked_attacks_recent: state.blocked_attacks.slice(-5)
  };
}

function handleDsupShield(params = {}) {
  const action = params.action || 'inspect';
  switch (action) {
    case 'deploy':
    case 'deploy_dsup_shield':
      return deployDsupShield(params);
    case 'intercept':
    case 'intercept_mutation':
    case 'intercept_mutation_attempt':
      return interceptMutationAttempt(params);
    case 'inspect':
    case 'status':
    default:
      return inspectDsupStatus(params);
  }
}

module.exports = {
  handleDsupShield,
  deployDsupShield,
  interceptMutationAttempt,
  inspectDsupStatus,
  dsupRegistry
};
