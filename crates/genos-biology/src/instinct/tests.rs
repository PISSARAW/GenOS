use super::*;

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

fn capable_execution() -> ExecutionContext {
    ExecutionContext::new(
        vec!["genos_biomimicry".to_string(), "genos_snapshot".to_string()],
        100.0,
    )
}

fn full_field() -> StimulusField {
    StimulusField::new().push(SignStimulus::new(
        Modality::Pheromone,
        "resource_exhausted",
        0.9,
    ))
}

fn run_forage(execution: &ExecutionContext) -> InstinctOutcome {
    let program = forage_instinct();
    let field = full_field();
    let hormones = HormoneState::new();
    let ctx = InstinctRunContext {
        field: &field,
        hormones: &hormones,
        execution,
    };
    program.run(&ctx)
}

#[test]
fn stimulus_below_threshold_is_not_triggered() {
    let program = forage_instinct();
    let field = StimulusField::new().push(SignStimulus::new(
        Modality::Pheromone,
        "resource_exhausted",
        0.2,
    ));
    let hormones = HormoneState::new();
    let execution = capable_execution();
    let ctx = InstinctRunContext {
        field: &field,
        hormones: &hormones,
        execution: &execution,
    };
    assert!(matches!(
        program.run(&ctx),
        InstinctOutcome::NotTriggered { .. }
    ));
}

#[test]
fn authorized_paf_validates_to_pending() {
    // run() ne fait que valider le plan : Pending, jamais Complete mensonger.
    // Seul l'executor externe (avec receipts) convertit Pending en Complete.
    let outcome = run_forage(&capable_execution());
    assert!(matches!(
        outcome,
        InstinctOutcome::Pending { steps_ready: 2, .. }
    ));
}

#[test]
fn chain_depth_overflow_is_blocked() {
    // Anti-boucle : une chaîne de redéclenchements trop profonde est bloquée.
    let mut execution = capable_execution();
    execution.chain_depth = MAX_CHAIN_DEPTH;
    assert!(matches!(run_forage(&execution), InstinctOutcome::Blocked { .. }));
}

#[test]
fn unauthorized_tool_interrupts_paf() {
    let execution = ExecutionContext::new(vec!["genos_biomimicry".to_string()], 100.0);
    let outcome = run_forage(&execution);
    assert!(matches!(
        outcome,
        InstinctOutcome::Interrupt { at_step: 1, .. }
    ));
}

#[test]
fn apoptotic_agent_is_blocked() {
    let mut execution = capable_execution();
    execution.apoptotic = true;
    assert!(matches!(
        run_forage(&execution),
        InstinctOutcome::Blocked { .. }
    ));
}

#[test]
fn insufficient_atp_budget_blocks_the_complete_paf() {
    let execution = ExecutionContext::new(
        vec!["genos_biomimicry".to_string(), "genos_snapshot".to_string()],
        1.0,
    );
    assert!(matches!(
        run_forage(&execution),
        InstinctOutcome::Blocked { .. }
    ));
}

#[test]
fn oxytocin_lowers_threshold() {
    let hormones = HormoneState {
        oxytocin: 1.0,
        ..Default::default()
    };
    assert!(hormones.threshold_modifier() < 1.0);
}

#[test]
fn dopamine_raises_execution_gain() {
    let hormones = HormoneState {
        dopamine: 1.0,
        ..Default::default()
    };
    assert!(hormones.execution_gain() > 1.0);
}

#[test]
fn instinct_gene_is_developmentally_locked() {
    let gene = forage_instinct().to_gene();
    assert!(gene.developmentally_locked);
    assert!(is_instinct_locus(&gene.locus));
}
