use serde::{Deserialize, Serialize};

/// 4. CONSTRUCTION DE NICHE (Forcer le monde à être prévisible)
/// Au lieu de subir un environnement OOD (Out-of-Distribution),
/// l'agent le transforme physiquement pour l'adapter à sa zone de confort évolutive.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NicheConstruction {
    pub is_niche_established: bool,
}

impl NicheConstruction {
    pub fn construct_niche(&mut self) -> String {
        self.is_niche_established = true;
        "🏗️ [CONSTRUCTION DE NICHE] Environnement hostile. L'agent restructure le dossier (ex: init Git, setup des configs standards) pour forcer le retour à une distribution connue.".to_string()
    }
}

/// 3. RÉTROGRADATION COGNITIVE (Fallback Heuristique)
/// Si le Cortex Préfrontal (Plan complexe) s'effondre en OOD total,
/// l'organisme bascule sur des heuristiques de survie de bas niveau (Tronc cérébral).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CognitiveFallback {
    pub fallback_active: bool,
}

impl CognitiveFallback {
    pub fn trigger_fallback(&mut self) -> String {
        self.fallback_active = true;
        "📉 [RÉTROGRADATION] Le plan complexe s'effondre face à l'inconnu. Basculement sur les heuristiques primitives: Stop, Fuir, Demander au Humain (Graceful Degradation).".to_string()
    }
}

/// 2. LA SURPRISE ET LA NORADRÉNALINE (Erreur de Prédiction Massive)
/// Si (Réalité != Prédiction), libération de noradrénaline :
/// Interruption immédiate du plan en cours et passage en Apprentissage Rapide (One-Shot).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SurpriseResponse {
    pub noradrenaline_level: f32,
}

impl SurpriseResponse {
    pub fn evaluate_surprise(&mut self, expected: &str, actual: &str) -> Result<(), String> {
        if expected != actual {
            self.noradrenaline_level = 1.0;
            return Err(format!("⚡ [SURPRISE/NORADRÉNALINE] Attendu: '{}', Réel: '{}'. ÉTAT OOD DÉTECTÉ. Interruption des routines automatiques. Plasticité synaptique rapide activée.", expected, actual));
        }
        self.noradrenaline_level = 0.0;
        Ok(())
    }
}

/// 1. ABSTRACTION DES INVARIANTS (Physique Profonde)
/// Extrait les invariants structurels (ex: 'C'est un projet Rust') 
/// plutôt que d'overfitter sur les pixels de surface (ex: 'Le fichier main.rs fait 24 lignes').
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DeepInvariantAbstraction {
    pub known_topologies: std::collections::HashSet<String>,
}

impl DeepInvariantAbstraction {
    pub fn extract_invariant(&self, state: &str) -> bool {
        // En vrai: Analyser la topologie profonde de la codebase
        self.known_topologies.contains(state)
    }
}

/// L'ORGANE DE RÉSILIENCE OOD (Dégradation Gracieuse)
/// Empêche la fragilité (brittleness) de l'IA quand elle sort de ses données d'entraînement.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GracefulDegradation {
    pub abstraction: DeepInvariantAbstraction,
    pub surprise: SurpriseResponse,
    pub fallback: CognitiveFallback,
    pub niche: NicheConstruction,
}

impl GracefulDegradation {
    pub fn new() -> Self {
        Self::default()
    }

    /// Processus biologique de gestion de la Nouveauté et de l'Inconnu (Out-of-Distribution)
    pub fn handle_reality_shift(&mut self, expected_state: &str, actual_state: &str, topology: &str) -> String {
        // 1. Est-ce qu'on reconnaît l'invariant profond malgré le bruit de surface ?
        if self.abstraction.extract_invariant(topology) {
            return "✅ [ABSTRACTION] Changement de surface ignoré. La topologie profonde reste dans la distribution connue.".to_string();
        }

        // 2. Si c'est un vrai changement OOD, la discordance génère la Surprise
        let surprise_res = self.surprise.evaluate_surprise(expected_state, actual_state);
        
        if let Err(msg) = surprise_res {
            // 3. La surprise est totale. Peut-on restructurer le monde (Construire une Niche) ?
            if !self.niche.is_niche_established {
                return format!("{}\n{}", msg, self.niche.construct_niche());
            }

            // 4. Si la niche est déjà faite et que c'est toujours massivement OOD -> Rétrogradation
            return format!("{}\n{}", msg, self.fallback.trigger_fallback());
        }

        "Normal".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ood_resilience() {
        let mut ood = GracefulDegradation::new();
        ood.abstraction.known_topologies.insert("RUST_CARGO_PROJECT".to_string());

        // 1. Changement mineur (Invariant reconnu, pas de panique)
        let res_invariant = ood.handle_reality_shift("A", "B", "RUST_CARGO_PROJECT");
        assert!(res_invariant.contains("ABSTRACTION"));

        // 2. Changement majeur (OOD) -> Sécrétion Noradrénaline + Niche Construction
        let res_surprise = ood.handle_reality_shift("A", "B", "UNKNOWN_FRAMEWORK");
        assert!(res_surprise.contains("NORADRÉNALINE"));
        assert!(res_surprise.contains("CONSTRUCTION DE NICHE"));
        assert!(ood.surprise.noradrenaline_level > 0.5);

        // 3. Si l'environnement reste hostile malgré la niche -> Rétrogradation (Fallback)
        let res_fallback = ood.handle_reality_shift("X", "Y", "UNKNOWN_FRAMEWORK");
        assert!(res_fallback.contains("RÉTROGRADATION"));
    }
}