use genos_core::loop_detection::CognitiveLoopError;
use serde::Serialize;

#[derive(Serialize)]
pub struct DivergenceReport {
    pub error_step: usize,
    pub causal_divergence_step: usize,
    pub safest_revert_step: usize,
    #[serde(skip_serializing)] // Optional cognitive error just for formatting the console output
    pub cognitive_error: Option<CognitiveLoopError>,
    pub cherry_pickable_actions_count: usize,
}

pub fn print_divergence_handoff(report: &DivergenceReport) {
    println!("\n========================================================");
    println!(" 🚨 DIVERGENCE CAUSALE DÉTECTÉE (Human-in-the-loop) 🚨");
    println!("========================================================\n");

    // 1. Explicabilité (Explainability)
    println!("📍 [Trajectoire de l'Agent]");
    println!(
        "   Étape {} [Dernier État Sain] -> Étape {} [DIVERGENCE] -> Étape {} [ERREUR/BLOCAGE]",
        report.safest_revert_step, report.causal_divergence_step, report.error_step
    );
    println!();

    if let Some(err) = &report.cognitive_error {
        println!("🧠 Diagnostic Cognitif :");
        println!("   {}", err);
        println!();
    }

    // 2. Handoff Gracieux (Graceful Handoff)
    println!("🤝 Handoff Gracieux :");
    println!("   \"Je me suis arrêté avant de causer des dommages. L'erreur semble s'enraciner");
    println!(
        "    à l'étape {}, mais j'ai identifié un point de restauration sécurisé (LKGS).\"",
        report.causal_divergence_step
    );
    println!();

    // 3. Preuve d'innocuité (Proof of Safety)
    println!("🛡️  Preuve d'Innocuité :");
    println!("   Vos fichiers originaux et la structure de l'application sont protégés par le Context Sandbox.");
    println!("   Toute l'action fautive a été contenue dans la Causal Boundary courante.");

    if report.cherry_pickable_actions_count > 0 {
        println!(
            "   💡 Bonne nouvelle : {} actions parallèles saines ont été détectées et pourront être préservées (Cherry-pick).",
            report.cherry_pickable_actions_count
        );
    }
    println!();

    // 4. Micro-interactions
    println!("🛠️  Options de Résolution Rapide (CLI) :");
    println!("   Option A - Revenir au point sûr et bifurquer :");
    println!(
        "     $ genos fork --from-step {}",
        report.safest_revert_step
    );
    println!();
    println!("   Option B - Reprendre la main manuellement depuis la divergence :");
    println!(
        "     $ genos agent resume --manual --step {}",
        report.causal_divergence_step
    );
    println!();
    println!("   Option C - Re-fusionner manuellement les changements :");
    println!("     $ genos merge --interactive");
    println!();
}
