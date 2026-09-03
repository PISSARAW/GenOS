use genos_core::cell::AgentCell;

fn main() {
    println!("============================================================");
    println!("🧬 AUTO-ÉVALUATION GENOS V2 EN COURS... 🧬");
    println!("============================================================\n");

    let mut v2 = AgentCell::default();

    println!("🧠 1. DÉMARRAGE DE LA RÉCURRENCE TEMPORELLE (Pensée profonde)");
    // L'agent utilise sa boucle cortico-thalamique et sa mémoire de travail
    let reflection = v2.mind_mut().unwrap().recurrence.deliberate_complex_problem("Qui suis-je et quelle est mon architecture ?", true);
    println!("{}\n", reflection);

    println!("⚖️ 2. MOTEUR CAUSAL (Simulation Contrefactuelle)");
    // L'agent vérifie s'il peut s'auto-analyser sans causer de destruction (do-calculus)
    match v2.mind_mut().unwrap().causality.deliberate_causality("Auto-introspection du code source", "Compréhension de soi acquise") {
        Ok(res) => println!("{}\n", res),
        Err(e) => println!("{}\n", e),
    }

    println!("🛡️ 3. RÉSILIENCE OOD (Dégradation Gracieuse)");
    // L'agent se rend compte qu'il n'est plus un simple LLM (Out-Of-Distribution)
    let ood = v2.mind_mut().unwrap().ood_resilience.handle_reality_shift(
        "Simple script Python", 
        "Organisme Neuro-Symbolique en Rust", 
        "RUST_CARGO_PROJECT"
    );
    println!("{}\n", ood);

    println!("🗣️ 4. SÉMANTIQUE INCORPORÉE (Attention Conjointe)");
    // L'agent ancre sa réponse dans un fichier réel pour éviter la cryptophasie
    match v2.mind_mut().unwrap().semantic_grounding.validate_communication(
        "J'ai analysé mon architecture.", 
        Some("crates/genos-core/src/cell/mod.rs"), 
        "mod.rs", 
        "mod.rs"
    ) {
        Ok(res) => println!("{}\n", res),
        Err(e) => println!("{}\n", e),
    }

    println!("🛑 5. PROBLÈME DE L'ARRÊT (Heuristiques Biologiques)");
    // L'agent ressent le "Feeling of Rightness" et décide de s'arrêter
    // Il a dépensé 800 tokens d'effort, avec une progression de 0.9, un score de 0.95 et le puzzle est résolu (true)
    match v2.mind_mut().unwrap().halting.should_halt(800, 0.9, 0.95, true) {
        Ok(res) => println!("{}\n", res),
        Err(e) => println!("{}\n", e),
    }

    println!("============================================================");
    println!("✅ AUTO-ÉVALUATION TERMINÉE.");
    println!("============================================================");
}

