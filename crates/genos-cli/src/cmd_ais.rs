use crate::args::{AisClonalHypermutateArgs, AisDangerTelemetryArgs, AisNegativeScreenArgs};
use anyhow::Result;
use genos_core::resilience::ais::{
    Antibody, ClonalSelector, DangerModel, DamSignal, NegativeSelector,
};

/// Parse une embedding fournie en ligne de commande sous forme de floats séparés
/// par des espaces.
fn parse_embedding(values: &[f32]) -> Result<Vec<f32>> {
    if values.is_empty() {
        anyhow::bail!("embedding must contain at least one float");
    }
    Ok(values.to_vec())
}

/// Censure thymique : filtre des détecteurs-candidats contre un corpus self.
pub async fn cmd_ais_negative_screen(args: AisNegativeScreenArgs) -> Result<()> {
    let mut thymus = NegativeSelector::new(args.gamma, args.theta_self);
    for sample in &args.self_sig {
        thymus.train_self(parse_embedding(std::slice::from_ref(sample))?);
    }

    // Candidats : chaque dimension de --candidate forme un détecteur mono-dimensionnel.
    let candidates: Vec<Antibody> = args
        .candidate
        .iter()
        .enumerate()
        .map(|(i, value)| Antibody {
            id: format!("candidate-{i}"),
            centroid: vec![*value],
            radius: 0.2,
            generation: 0,
        })
        .collect();

    let (accepted, rejected) = thymus.deploy_tolerant_population(candidates);
    println!(
        "Thymic censoring: {} accepted, {} rejected (theta_self={:.2})",
        accepted.len(),
        rejected.len(),
        args.theta_self
    );
    for antibody in &rejected {
        println!("REJECTED {} (self-reactive)", antibody.id);
    }
    for antibody in &accepted {
        println!("ACCEPTED {}", antibody.id);
    }
    Ok(())
}

/// Sélection clonale + hypermutation somatique d'un anticorps face à un antigène.
pub async fn cmd_ais_clonal_hypermutate(args: AisClonalHypermutateArgs) -> Result<()> {
    let selector = ClonalSelector {
        gamma: args.gamma,
        theta_threat: args.theta_threat,
        clone_factor: args.clone_factor,
        mutation_sigma: args.mutation_sigma,
    };
    let parent = Antibody {
        id: args.antibody_id.clone(),
        centroid: parse_embedding(&args.centroid)?,
        radius: 0.2,
        generation: 0,
    };
    let antigen = parse_embedding(&args.antigen)?;

    if !selector.binds(&parent, &antigen) {
        println!(
            "Antibody {}: no binding (antigen below threat threshold {:.2}); no clonal expansion",
            args.antibody_id, args.theta_threat
        );
        return Ok(());
    }

    println!("Antibody {} binds antigen; expanding clones...", args.antibody_id);
    match selector.mature_affinity(&parent, &antigen, args.seed) {
        Some(matured) => {
            let pa = genos_core::resilience::ais::rbf_affinity(
                &parent.centroid,
                &antigen,
                args.gamma,
            );
            let ma = genos_core::resilience::ais::rbf_affinity(&matured.centroid, &antigen, args.gamma);
            println!(
                "Matured antibody {} generation {}: affinity {:.3} -> {:.3}",
                matured.id, matured.generation, pa, ma
            );
        }
        None => println!("No clone surpassed the parent affinity; parent retained."),
    }
    Ok(())
}

/// Télémétrie DAMP : calcule le niveau de danger et l'activation immunitaire.
pub async fn cmd_ais_danger_telemetry(args: AisDangerTelemetryArgs) -> Result<()> {
    let mut signals = Vec::new();
    if args.failures > 0 {
        signals.push(DamSignal::ConsecutiveFailures(args.failures));
    }
    if args.semantic_divergence > 0.0 {
        signals.push(DamSignal::SemanticDivergence(args.semantic_divergence));
    }
    if args.context_pollution > 0 {
        signals.push(DamSignal::ContextPollution(args.context_pollution));
    }
    if args.cost_overrun > 0.0 {
        signals.push(DamSignal::CostOverrun(args.cost_overrun));
    }
    if args.invariant_breach {
        signals.push(DamSignal::InvariantBreach);
    }

    let model = DangerModel::new(args.damp_threshold);
    let level = model.damp_level(&signals);
    let triggered = model.immune_response_triggered(&signals);
    println!("DAMP level: {level:.3} (threshold {:.2})", args.damp_threshold);
    println!(
        "Immune response: {}",
        if triggered { "TRIGGERED" } else { "quiescent" }
    );
    Ok(())
}
