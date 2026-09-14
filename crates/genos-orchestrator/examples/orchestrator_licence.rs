//! Test « niveau licence » : l'orchestrateur doit mobiliser une douzaine de
//! concepts GenOS pour accomplir une mission de bout en bout.

use genos_orchestrator::genos_biology::neurobiology::Neurotransmitter;
use genos_orchestrator::genos_biology::therapy::SystemicTherapy;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_genome::Genome;
use genos_orchestrator::genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::genos_signal::SignalingMode;
use genos_orchestrator::{
    BucketState, GenosEcosystem, SchedulingDecision, TokenBucketScheduler, dna_ops, genome_ops,
    phylogeny::PhylogenyLab,
};

fn main() {
    println!("=== MISSION LICENCE : l'orchestrateur doit tout mobiliser ===\n");
    let mut used = 0;

    let mut eco = GenosEcosystem::new("Griot_Prime");

    // 1. Organogenèse : tissus + cellules
    eco.orchestrator.create_tissue("Core", "Logique").unwrap();
    let chidi = eco
        .orchestrator
        .add_worker("Core", AgentCell::new("Chidi", "logique", "Analyst"))
        .unwrap();
    let nia = eco
        .orchestrator
        .add_worker("Core", AgentCell::new("Nia", "determination", "Verifier"))
        .unwrap();
    let zola = eco
        .orchestrator
        .add_worker("Core", AgentCell::new("Zola", "reserve", "Worker"))
        .unwrap();
    used += 1;
    println!("[{used:02}] Organogenese (tissu + 3 cellules)");

    // 2. Délégation hiérarchique (Desmosomes)
    let delegation = eco.orchestrator.delegate_task("Core", (chidi, "compiler")).unwrap();
    assert!(delegation.contains("Desmosome"));
    used += 1;
    println!("[{used:02}] Delegation Desmosome");

    // 3. Écologie anti-collusion (Handicap de Zahavi + réalité)
    assert!(eco.orchestrator.audit_collusion("Core", ("Nia", 100, true)).is_err());
    assert!(eco.orchestrator.audit_collusion("Core", ("Nia", 900, true)).is_ok());
    used += 1;
    println!("[{used:02}] Audit anti-collusion");

    // 4. Immunité clonale (AIS)
    eco.orchestrator
        .immune_selection
        .detectors
        .push(AntibodyDetector::new("phage", "INJECTION", 0.8));
    let threat = Antigen {
        id: "t1".into(),
        epitope: "INJECTION".into(),
        danger_level: 0.9,
    };
    assert!(eco.orchestrator.detect_immune_threat(&threat));
    used += 1;
    println!("[{used:02}] Immunite clonale (detection antigenique)");

    // 5. Quotas de calcul (token bucket + apoptose par gaspillage)
    let mut sched = TokenBucketScheduler::new();
    sched.register_agent("Chidi", 50.0, 100.0);
    assert!(matches!(
        sched.schedule_step("Chidi", 20.0),
        SchedulingDecision::Allowed { .. }
    ));
    assert!(sched.reward_proof("Chidi", 0.9).unwrap().added_tokens > 0.0);
    assert!(matches!(
        sched.penalize_waste("Chidi", 1.0).unwrap().state,
        BucketState::Apoptotic
    ));
    used += 1;
    println!("[{used:02}] Quotas token-bucket (reward + apoptose)");

    // 6. Conscience (dissonance / progression)
    let state = eco.orchestrator.evaluate_worker(nia, (0, 5.0)).unwrap();
    assert!(!state.is_apoptotic);
    used += 1;
    println!("[{used:02}] Conscience (evaluation de branche)");

    // 7. Stigmergie (piste d'évidence)
    eco.deposit_trail("EVIDENCE_PATH", 7.0);
    assert_eq!(eco.read_trail("EVIDENCE_PATH"), 7.0);
    used += 1;
    println!("[{used:02}] Stigmergie (depot/lecture de pheromone)");

    // 8. Cascade de signalisation (ligand -> récepteur)
    let ligand = genos_orchestrator::signaling::SignalingCascade::ligand(
        "ATP",
        SignalingMode::Paracrine,
        3.0,
    );
    let lig = eco.signaling.emit(ligand);
    eco.signaling.express_receptor("ATP", "ACTIVATE_GLYCOLYSIS", 1.0);
    assert_eq!(eco.signaling.transduce(lig).as_deref(), Some("ACTIVATE_GLYCOLYSIS"));
    used += 1;
    println!("[{used:02}] Cascade de signalisation (ligand/recepteur)");

    // 9. Quorum sensing (phénotype collectif)
    eco.quorum.add_cells(500);
    eco.quorum.step(1.0);
    assert!(eco.quorum.activation_level() >= 0.0);
    used += 1;
    println!("[{used:02}] Quorum sensing (auto-inducteur)");

    // 10. Virologie + neutralisation immunitaire
    let virus = eco.virology.synthesize_bacteriophage("INJECTION", "KILL");
    assert!(eco.neutralize_virion(virus, 0.9));
    assert!(eco.virology.virions[virus].is_neutralized);
    used += 1;
    println!("[{used:02}] Virologie (bacteriophage neutralise)");

    // 11. Neurobiologie (synapse -> soma)
    eco.neuro.receive("axon-1", Neurotransmitter::Dopamine, 3.0);
    let _spikes = eco.neuro.fire();
    eco.neuro.apply_plasticity();
    used += 1;
    println!("[{used:02}] Neurobiologie (neurotransmission + plasticite)");

    // 12. ADN compilé (encode/decode/hash)
    let genome = Genome::new("BASE_DNA");
    let dna = dna_ops::from_genome(&genome, "Chidi");
    let bytes = dna_ops::encode(&dna).unwrap();
    let decoded = dna_ops::decode(&bytes).unwrap();
    assert_eq!(
        dna_ops::content_hash(&dna).unwrap(),
        dna_ops::content_hash(&decoded).unwrap()
    );
    used += 1;
    println!("[{used:02}] ADN compile (codec)");

    // 13. Génome : empreinte vérifiable
    let fingerprint = genome_ops::fingerprint(&genome).unwrap();
    assert!(genome_ops::verify_fingerprint(&genome, &fingerprint));
    used += 1;
    println!("[{used:02}] Genome (empreinte verifiee)");

    // 14. Résilience : sporulation puis germination dans le tissu
    let spore = eco
        .orchestrator
        .sporulate_cell(zola, genos_orchestrator::genos_biology::spore::SporeType::BacterialEndospore)
        .unwrap();
    assert!(eco.orchestrator.delegate_task("Core", (zola, "x")).is_err());
    eco.orchestrator.germinate_spore(spore, (true, true)).unwrap();
    assert!(eco.orchestrator.delegate_task("Core", (zola, "x")).is_ok());
    used += 1;
    println!("[{used:02}] Resilience (sporulation/germination)");

    // 15. Endosymbiose (symbiogenèse zéro-IPC)
    eco.orchestrator.trigger_endosymbiosis(chidi, nia).unwrap();
    assert_eq!(eco.orchestrator.active_cells.get(&chidi).unwrap().organelles.len(), 1);
    used += 1;
    println!("[{used:02}] Endosymbiose (organelle integree)");

    // 16. Pathologie + thérapie
    let mut patient = AgentCell::new("Patient", "p", "Worker");
    assert!(eco.assess_health(&patient).is_healthy);
    let outcome = eco.apply_therapy(&mut patient, &SystemicTherapy::IntensiveCareFluids);
    assert!(!outcome.therapy_name.is_empty());
    used += 1;
    println!("[{used:02}] Pathologie + therapie systemique");

    // 17. Phylogenèse (horloge moléculaire)
    let a = Genome::new("A");
    let b = Genome::new("B");
    assert!(PhylogenyLab::divergence_time(&a, &b) >= 0.0);
    used += 1;
    println!("[{used:02}] Phylogenese (horloge moleculaire)");

    println!("\nTOTAL : {used} concepts mobilises par l'orchestrateur");
    assert!(used >= 10, "au moins une dizaine de concepts attendus");
    println!("MISSION LICENCE VALIDEE");
}
