const { defineFamily } = require('../defineStrategy');

const perception = [
  ['echolocation_probe', 'Probe echolocatif', ['unknown_cause_bug', 'incident'], ['information_gain', 'low_blast_radius', 'probe_control'], 'implemented', ['probe_system', 'observe_response', 'infer_hidden_structure', 'adapt_next_action']],
  ['scent_trace', 'Trace olfactive causale', ['unknown_cause_bug', 'incident'], ['causal', 'deep_search', 'low_cost'], 'implemented', ['follow_trace_gradient', 'reinforce_causal_trail', 'falsify_false_trail']],
  ['foveal_scan', 'Scan foveal actif', ['all'], ['information_gain', 'low_latency', 'probe_control'], 'implemented', ['peripheral_watch', 'focus_region', 'verify_focus']],
  ['vibration_sense', 'Senseur vibratoire', ['incident', 'security'], ['safety', 'low_latency', 'observability'], 'implemented', ['detect_weak_signal', 'amplify_anomaly', 'confirm_signal']]
];

const navigation = [
  ['landmark_navigation', 'Navigation par reperes', ['critical_refactor', 'architecture_decision', 'unknown_cause_bug'], ['spatial_memory', 'low_cost', 'resilient'], 'implemented', ['build_landmark_map', 'navigate_by_landmark', 'return_to_safe_point']],
  ['homing_return', 'Retour au point sur', ['all'], ['safety', 'resilient', 'low_blast_radius'], 'implemented', ['safe_checkpoint', 'return_to_safe_point', 'validate_return']]
];

const coordination = [
  ['stigmergic_mark', 'Marque stigmergique', ['all'], ['collective', 'memory', 'low_cost'], 'implemented', ['deposit_trace', 'reinforce_trace', 'evaporate_trace']],
  ['distributed_limb_probe', 'Probe distribue par bras', ['unknown_cause_bug', 'critical_refactor', 'architecture_decision'], ['parallel', 'information_gain', 'distributed_control'], 'implemented', ['assign_local_probe', 'collect_limb_signal', 'arbitrate_limb_feedback']],
  ['waggle_recruitment', 'Recrutement par danse', ['all'], ['collective', 'budget', 'adaptive'], 'implemented', ['publish_waggle_signal', 'validate_recruitment', 'allocate_quorum_budget']]
];

const survival = [
  ['immune_challenge', 'Challenge immunitaire', ['security', 'critical_refactor', 'incident'], ['safety', 'verification', 'governance'], 'implemented', ['adversarial_challenge', 'permission_challenge', 'promotion_quarantine']],
  ['feign_inert_state', 'Etat inerte feint borne', ['security'], ['safety', 'governance', 'low_blast_radius'], 'implemented', ['reduce_attack_surface', 'observe_threat_persistence', 'restore_visibility']],
  ['energy_foraging', 'Fourragement energetique', ['all'], ['low_cost', 'budget', 'metabolic_budget'], 'implemented', ['estimate_patch_yield', 'compare_metabolic_cost', 'select_next_patch']]
];

module.exports = defineFamily('animal_control', [...perception, ...navigation, ...coordination, ...survival]);