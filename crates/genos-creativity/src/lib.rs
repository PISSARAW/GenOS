//! GenOS Creativity : moteur de créativité biomimétique.
//!
//! Ce crate implémente le couplage dynamique entre les systèmes cognitifs de
//! l'orchestrateur (DMN, salience, dopaminergique, consolidation) pour produire
//! des comportements créatifs émergents.
//!
//! ### Modules
//!
//! - `dreaming` : phase de rêve (DMN) — génération libre d'hypothèses brutes.
//! - `salience` : gate de salience — filtrage et restructuration pour l'exécutif.
//! - `dopamine` : signal RPE — mise à jour exploration/stress du Director.
//! - `consolidation` : consolidation cross — promesse de politiques permanentes.
//! - `creativity_engine` : orchestrateur unifié pour le cycle de créativité.
//! - `types` : types minimaux alignés sur genos-orchestrator (copies locales).

pub mod consolidation;
pub mod creativity_engine;
pub mod dopamine;
pub mod dreaming;
pub mod salience;
pub mod types;

pub use consolidation::CrossConsolidation;
pub use creativity_engine::{
    CreativityConfig, CreativityEngine, CreativityMetrics, DirectorAdapter,
};
pub use dopamine::{CreativityOutcome, DopamineSignal, DopamineTarget};
pub use dreaming::{DreamingPhase, RawHypothesis};
pub use salience::{FocusedTask, SalienceGate};
pub use types::{Concept, Goal, Metabolism, WorldState};

#[cfg(test)]
mod tests {
    use crate::consolidation::CrossConsolidation;
    use crate::creativity_engine::CreativityEngine;
    use crate::dopamine::DopamineSignal;
    use crate::dreaming::DreamingPhase;
    use crate::salience::SalienceGate;
    use crate::types::{Concept, Goal, Metabolism, WorldState};

    #[test]
    fn test_module_imports() {
        let config = CreativityConfig::default();
        let _engine = CreativityEngine::new(config);
        let _dreaming = DreamingPhase::new(config);
        let _salience = SalienceGate::new(0.6, 0.3);
        let _dopamine = DopamineSignal::new();
        let _consolidation = CrossConsolidation::new();
        let _metabolism = Metabolism::new(100.0);
        let _world = WorldState::default();
        let _goal = Goal::default();
        let _concept = Concept::Observe;
    }
}
