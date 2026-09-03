use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Type de signal moléculaire utilisé par les agents pour communiquer.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AutoInducer {
    /// AHL (Gram-) : Communication intra-tissu spécifique
    Ahl(String),
    /// AIP (Gram+) : Communication à courte portée
    Aip(String),
    /// AI-2 : Langage universel (inter-agents globaux)
    Ai2,
}

/// Représente les contraintes de l'environnement (Diffusion Sensing / Efficiency Sensing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EfficiencyEnvironment {
    /// Taux de diffusion (ex: Rate limit API, tokens disponibles)
    pub mass_transfer_rate: f32,
    /// Viscosité (ex: latence réseau, complexité du contexte)
    pub viscosity: f32,
}

impl EfficiencyEnvironment {
    pub fn new(mass_transfer_rate: f32, viscosity: f32) -> Self {
        Self {
            mass_transfer_rate,
            viscosity,
        }
    }

    /// Détermine si l'environnement permet une communication efficace
    pub fn is_favorable(&self) -> bool {
        self.mass_transfer_rate > 0.3 && self.viscosity < 0.8
    }
}

/// Le récepteur qui capte la densité du signal (ex: LuxR)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LuxReceptor {
    /// Seuil d'activation (Concentration d'auto-inducteurs requise)
    pub activation_threshold: usize,
    /// Concentration actuelle par type de signal
    pub signal_concentration: HashMap<AutoInducer, usize>,
}

impl LuxReceptor {
    pub fn new(threshold: usize) -> Self {
        Self {
            activation_threshold: threshold,
            signal_concentration: HashMap::new(),
        }
    }

    /// Ajoute un signal (Phagocytose d'une molécule)
    pub fn bind_auto_inducer(&mut self, inducer: AutoInducer) {
        *self.signal_concentration.entry(inducer).or_insert(0) += 1;
    }

    /// Vérifie si le Quorum est atteint pour un signal donné
    pub fn is_quorum_reached(&self, inducer: &AutoInducer) -> bool {
        if let Some(conc) = self.signal_concentration.get(inducer) {
            *conc >= self.activation_threshold
        } else {
            false
        }
    }
}

/// L'enzyme de défense (Quorum Quenching)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuorumQuencher {
    /// Efficacité de l'enzyme lactonase (taux de dégradation)
    pub degradation_rate: usize,
}

impl QuorumQuencher {
    pub fn new(rate: usize) -> Self {
        Self { degradation_rate: rate }
    }

    /// Dégrade les signaux accumulés (ex: pour isoler un agent spammeur)
    pub fn quench_signals(&self, receptor: &mut LuxReceptor, inducer: &AutoInducer) {
        if let Some(conc) = receptor.signal_concentration.get_mut(inducer) {
            *conc = conc.saturating_sub(self.degradation_rate);
        }
    }
}

/// L'organe complet de Quorum Sensing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuorumSensor {
    pub receptor: LuxReceptor,
    pub environment: EfficiencyEnvironment,
    pub immune_quencher: QuorumQuencher,
}

impl Default for QuorumSensor {
    fn default() -> Self {
        Self {
            receptor: LuxReceptor::new(5),
            environment: EfficiencyEnvironment::new(1.0, 0.2), // Idéal par défaut
            immune_quencher: QuorumQuencher::new(3),
        }
    }
}

impl QuorumSensor {
    /// L'agent évalue s'il doit lancer une action coûteuse (ex: appel LLM majeur)
    pub fn deliberate_group_action(&self, inducer: &AutoInducer) -> Result<String, String> {
        // 1. Efficiency Sensing (Le milieu le permet-il ?)
        if !self.environment.is_favorable() {
            return Err("❌ [EFFICIENCY SENSING] Viscosité trop haute ou diffusion faible. Action de groupe avortée.".to_string());
        }

        // 2. Quorum Sensing (Sommes-nous assez nombreux/d'accord ?)
        if self.receptor.is_quorum_reached(inducer) {
            Ok("✅ [QUORUM ATTEINT] L'expression génique collective (Appel LLM lourd) est autorisée.".to_string())
        } else {
            Err("⏳ [ATTENTE QUORUM] Densité cellulaire insuffisante. Économie d'énergie.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quorum_activation() {
        let mut qs = QuorumSensor::default();
        let signal = AutoInducer::Ai2;

        // Au début, pas de quorum
        assert!(qs.deliberate_group_action(&signal).is_err());

        // On sature de signaux
        for _ in 0..5 {
            qs.receptor.bind_auto_inducer(signal.clone());
        }

        // Quorum atteint
        assert!(qs.deliberate_group_action(&signal).is_ok());
    }

    #[test]
    fn test_efficiency_sensing() {
        let mut qs = QuorumSensor::default();
        let signal = AutoInducer::Ai2;
        for _ in 0..5 {
            qs.receptor.bind_auto_inducer(signal.clone());
        }

        // Le quorum est atteint, mais on altère l'environnement (Rate Limit)
        qs.environment.mass_transfer_rate = 0.1;

        let result = qs.deliberate_group_action(&signal);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("EFFICIENCY SENSING"));
    }

    #[test]
    fn test_quorum_quenching() {
        let mut qs = QuorumSensor::default();
        let signal = AutoInducer::Ai2;
        
        // Un agent spamme 5 signaux (Quorum atteint)
        for _ in 0..5 {
            qs.receptor.bind_auto_inducer(signal.clone());
        }
        assert!(qs.receptor.is_quorum_reached(&signal));

        // Déploiement de la Lactonase (Quorum Quenching)
        qs.immune_quencher.quench_signals(&mut qs.receptor, &signal);

        // Le Quorum est brisé
        assert!(!qs.receptor.is_quorum_reached(&signal));
    }
}
