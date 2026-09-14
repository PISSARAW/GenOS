//! Vérifie que l'orchestrateur peut piloter un instinct arbitrarienement :
//! encoder le locus inné dans un génome qu'il gère, puis exécuter le PAF.

use genos_orchestrator::genos_biology::instinct::{
    ExecutionContext, FixedActionPattern, HormoneState, InnateReleasingMechanism, InstinctOutcome,
    InstinctProgram, InstinctRunContext, Modality, MotorStep, SignStimulus, StimulusField,
    is_instinct_locus,
};
use genos_orchestrator::genos_genome::Genome;
use genos_orchestrator::{BiomimeticOrchestrator, GenosEcosystem, Goal};

fn forage_instinct() -> InstinctProgram {
    InstinctProgram::new(
        "LOCUS_INSTINCT_FORAGE_RETURN",
        InnateReleasingMechanism::new(Modality::Pheromone, "resource_exhausted", 0.5),
        FixedActionPattern::new(
            "forage_return",
            vec![
                MotorStep::new("deposit_harvest_marker", "genos_biomimicry").auto(),
                MotorStep::new("return_to_hive", "genos_snapshot"),
            ],
        ),
    )
}

fn exhausted_field() -> StimulusField {
    StimulusField::new().push(SignStimulus::new(
        Modality::Pheromone,
        "resource_exhausted",
        0.9,
    ))
}

#[test]
fn orchestrator_encodes_and_runs_an_instinct_at_will() {
    let mut orch = BiomimeticOrchestrator::new("Instinct_Prime", 50.0, 100.0);
    let program = forage_instinct();

    // L'orchestrateur gère un génome portant le locus inné verrouillé.
    let mut genome = Genome::new("INSTINCT_HOST");
    genome.insert_gene(program.to_gene());
    let genome_id = genome.genome_id();
    orch.genomes.insert(genome_id, genome);

    let stored = orch.genomes.get(&genome_id).unwrap();
    assert!(stored.genes.keys().any(|locus| is_instinct_locus(locus)));

    // Déclenchement arbitraire du PAF par l'orchestrateur, sans LLM.
    let field = exhausted_field();
    let hormones = HormoneState {
        oxytocin: 0.6,
        dopamine: 1.0,
        ..Default::default()
    };
    let execution = ExecutionContext::new(
        vec!["genos_biomimicry".to_string(), "genos_snapshot".to_string()],
        100.0,
    );
    let ctx = InstinctRunContext {
        field: &field,
        hormones: &hormones,
        execution: &execution,
    };
    assert!(matches!(
        program.run(&ctx),
        InstinctOutcome::Complete { steps_executed: 2, .. }
    ));
}

#[test]
fn orchestrator_can_veto_an_instinct_tool() {
    let program = forage_instinct();
    let field = exhausted_field();
    let hormones = HormoneState::new();
    // Politique volontairement restrictive : le second outil n'est pas autorisé.
    let execution = ExecutionContext::new(vec!["genos_biomimicry".to_string()], 100.0);
    let ctx = InstinctRunContext {
        field: &field,
        hormones: &hormones,
        execution: &execution,
    };
    assert!(matches!(
        program.run(&ctx),
        InstinctOutcome::Interrupt { at_step: 1, .. }
    ));
}

#[test]
fn tick_evaluates_instincts_automatically() {
    let mut eco = GenosEcosystem::new("Instinct_Tick");
    assert!(eco.last_instincts().is_empty());
    let _ = eco.tick(&Goal::SecurePerimeter);
    assert_eq!(eco.last_instincts().len(), 1);
}

#[test]
fn run_autonomous_evaluates_instincts_each_tick() {
    let mut eco = GenosEcosystem::new("Instinct_Auto");
    let report = eco.run_autonomous(1);
    assert_eq!(report.ticks, 1);
    assert_eq!(eco.last_instincts().len(), 1);
}
