const PRIMITIVE_ALIASES = {
  search_failures: ['diagnose', 'search_memory', 'falsifiable_hypothesis_tree', 'hypotheses', 'hypothesis_evidence', 'probe'],
  diagnose: ['diagnose', 'falsifiable_hypothesis_tree', 'probe'],
  snapshot: ['snapshot', 'deterministic_direct_path', 'minimal_patch'],
  fork: ['fork', 'isolated_forks', 'n_way_counterfactual_fork'],
  solve: ['run', 'implementation', 'verify'],
  hypothesis_evidence: ['evidence', 'hypothesis_evidence', 'diagnose'],
  evaluate_trajectories: ['evaluate', 'prm_evaluate', 'evidence', 'hypothesis_evidence', 'multi_objective_evaluation', 'rank_states'],
  resilience_hypermutation: ['hypermutation', 'mutate', 'hypermutation_reheat', 'minimal_mutation'],
  adversarial_review: ['adversarial_review', 'verify', 'independent_verify', 'pareto_select'],
  security_coevolution: ['security', 'red_queen', 'adversarial_review'],
  replay: ['replay', 'safe_revert', 'verify'],
  record_decision: ['audit', 'record_decision', 'provenance'],
  biomimicry_mirror_twin_fork: ['mirror_twin', 'mirror_twin_fork'],
  biomimicry_hybrid_multiples: ['hybrid_multiples', 'matrix_polyovulation'],
  biomimicry_heteropaternal_superfecundation: ['heteropaternal', 'multi_vendor'],
  biomimicry_superfetation_pipeline: ['superfetation'],
  biomimicry_embryonic_diapause_pipeline: ['diapause', 'diapause_pipeline'],
  browser_act: ['web_foraging', 'scout'],
  optimal_foraging: ['foraging', 'harvester'],
  biomimicry_chromosomal_duplication: ['chromosomal_duplication', 'tandem_duplication'],
  biomimicry_chromosomal_inversion: ['chromosomal_inversion', 'backward_reasoning'],
  biomimicry_mitochondrial_dna_mutation: ['mitochondrial_mutation', 'energy_metabolism'],
  biomimicry_thalamic_bridge: ['thalamic_bridge', 'sensory_relay'],
  biomimicry_cryptophasia: ['cryptophasia', 'opcode_compression'],
  biomimicry_somatic_resonance: ['somatic_resonance', 'stress_telemetry'],
  biomimicry_chimeric_merge: ['chimeric_merge', 'mosaic_merge'],
  biomimicry_polyovulation_spawn: ['polyovulation_spawn', 'dizygotic_fleet'],
  biomimicry_monozygotic_split: ['monozygotic_split', 'isogenic_cloning'],
  biomimicry_conjoined_twin_bind: ['conjoined_twin_bind', 'visceral_coupling'],
  biomimicry_parasitic_graft: ['parasitic_graft', 'limb_harvest'],
  biomimicry_fetus_in_fetu: ['fetus_in_fetu', 'rescue_pod'],
  biomimicry_sesquizygotic_split: ['sesquizygotic_split', 'dispermic_split'],
  biomimicry_tissue_chimerism: ['tissue_chimerism', 'multi_dna_compartmentalization'],
  biomimicry_obligate_polyembryony: ['obligate_polyembryony', 'deterministic_cleavage'],
  biomimicry_marmoset_germline_chimerism: ['marmoset_germline_chimerism', 'proxy_spawn'],
  biomimicry_freemartin_inhibition: ['freemartin_inhibition', 'replication_lock'],
  biomimicry_point_mutation: ['point_mutation', 'missense_mutation'],
  biomimicry_frameshift_mutation: ['frameshift_mutation', 'indel_shift'],
  biomimicry_chromosomal_deletion: ['chromosomal_deletion', 'pipeline_pruning'],
  biomimicry_chromosomal_translocation: ['chromosomal_translocation', 'capability_grafting'],
  biomimicry_aneuploidy: ['aneuploidy', 'trisomy_consensus'],
  biomimicry_polyploidy: ['polyploidy', 'multi_layer_strategy'],
  biomimicry_transposon_jump: ['transposon_jump', 'retrotransposition'],
  biomimicry_dynamic_triplet_expansion: ['dynamic_triplet_expansion', 'microsatellite_anticipation'],
  biomimicry_epigenetic_methylation: ['epigenetic_methylation', 'environmental_memory'],
  biomimicry_horizontal_gene_transfer: ['horizontal_gene_transfer', 'bdelloid_absorption'],
  biomimicry_agrobacterium_tdna_hijack: ['agrobacterium_tdna_hijack', 'tdna_injection'],
  biomimicry_viral_endogenization: ['viral_endogenization', 'retroviral_integration'],
  biomimicry_tardigrade_dsup_shield: ['tardigrade_dsup_shield', 'dsup_shield'],
  biomimicry_turritopsis_transdifferentiation: ['turritopsis_transdifferentiation', 'polyp_reversion'],
  biomimicry_yamanaka_reprogramming: ['yamanaka_reprogramming', 'stem_reprogramming'],
  biomimicry_consciousness_transfer: ['consciousness_transfer', 'consciousness_replay'],
  biomimicry_novikov_causal_rebase: ['novikov_causal_rebase', 'zero_paradox_rebase']
};

function decisionGates() {
  return [
    {
      id: 'reselect_strategy', scope: 'orchestrator',
      when: 'the mission scope or risk materially differs from the active problem profile',
      actions: ['genos_change_strategy'],
      decide: 'state the changed need and evidence; keep the current contract when no better portfolio is found'
    },
    {
      id: 'retrieve_relevant_memory', scope: 'orchestrator_and_workers',
      when: 'before retrying an approach or accepting a diagnosis',
      actions: ['genos_search_failures', 'genos_compile_memory'],
      decide: 'retrieve prior failures and relevant experience; skip only when no query can be made specific'
    },
    {
      id: 'iterate_diagnosis', scope: 'orchestrator_and_workers',
      when: 'a test, invariant, or evidence item contradicts the current hypothesis',
      actions: ['genos_diagnose', 'genos_hypothesis_evidence'],
      decide: 'diagnose again with the new evidence; do not reuse a contradicted diagnosis'
    },
    {
      id: 'fork_or_delegate', scope: 'orchestrator',
      when: 'two hypotheses remain viable or independent verification has value',
      actions: ['genos_snapshot', 'genos_fork', 'genos_create'],
      decide: 'snapshot first, then create only the minimum independent branches or workers justified by the remaining budget'
    },
    {
      id: 'select_or_merge_hypotheses', scope: 'orchestrator',
      when: 'branches return evidence or a branch is dominated',
      actions: ['genos_evaluate_trajectories', 'genos_merge', 'genos_record_decision'],
      decide: 'discard dominated branches; merge only evidence-backed compatible hypotheses'
    },
    {
      id: 'replay_or_escalate', scope: 'orchestrator',
      when: 'an error needs isolation or before promotion',
      actions: ['genos_replay', 'genos_snapshot', 'genos_security_coevolution'],
      decide: 'replay the smallest relevant capsule; escalate to an adversarial Red/Blue loop for security or recurring failures'
    }
  ];
}

function organizationTransitions() {
  return [
    { when: 'independent branches converge with reproducible evidence', to: 'hierarchical_merge', action: 'merge only the evidence, not an unchecked workspace' },
    { when: 'branches remain materially divergent after minimum evidence', to: 'competitive_arena', action: 'retain isolation and allocate the next token tranche to the strongest two' },
    { when: 'a hard invariant, exploit, or parasite branch succeeds', to: 'red_blue_coevolution', action: 'snapshot, quarantine the branch, and open an adversarial counter-branch' },
    { when: 'budget reserve reaches its stop threshold', to: 'network_silence', action: 'stop new branches and replay the best verified capsule' }
  ];
}

module.exports = { PRIMITIVE_ALIASES, decisionGates, organizationTransitions };
