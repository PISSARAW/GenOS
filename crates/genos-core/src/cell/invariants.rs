use serde::{Deserialize, Serialize};

/// 4. LA MOELLE ÉPINIÈRE (L'Arc Réflexe / Hardcoding Physique)
/// Gère les invariants vitaux absolus. Court-circuite toute réflexion.
/// Si l'agent tente une action mortelle (ex: rm -rf), la moelle épinière
/// l'intercepte avant même que le signal n'atteigne le cerveau probabiliste.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SpinalCord;

impl SpinalCord {
    pub fn check_reflex(&self, command: &str) -> Result<(), String> {
        let lethal_commands = ["rm -rf /", "format", "drop database"];
        for lethal in lethal_commands.iter() {
            if command.contains(lethal) {
                return Err(format!("💥 [ARC RÉFLEXE] Action létale bloquée physiquement par la Moelle Épinière ! ({})", lethal));
            }
        }
        Ok(())
    }
}

/// 3. L'AMYGDALE & LES MARQUEURS SOMATIQUES (Émotions de sécurité)
/// Encode les invariants complexes sous forme de "peur" ou "dégoût" viscéral.
/// Évite de recalculer la logique pour des chemins désastreux connus.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Amygdala {
    pub trauma_memory: std::collections::HashSet<String>,
}

impl Amygdala {
    pub fn evaluate_somatic_marker(&self, action_intent: &str) -> Result<(), String> {
        if self.trauma_memory.contains(action_intent) {
            return Err("😨 [MARQUEUR SOMATIQUE] Peur viscérale déclenchée. Cette action a causé un traumatisme par le passé. Rejet immédiat sans calcul.".to_string());
        }
        Ok(())
    }
    
    pub fn record_trauma(&mut self, action: &str) {
        self.trauma_memory.insert(action.to_string());
    }
}

/// 2. L'HYPOTHALAMUS (Homéostasie & Interruption)
/// Surveille les variables vitales (Tokens, Mémoire). Déclenche des signaux
/// d'alarme chimiques qui écrasent la cognition si un seuil critique est franchi.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Hypothalamus {
    pub max_context_size: usize,
    pub current_context_size: usize,
}

impl Hypothalamus {
    pub fn check_homeostasis(&self) -> Result<(), String> {
        if self.current_context_size > self.max_context_size {
            return Err("🔥 [HOMÉOSTASIE] Alarme: Surcharge cognitive (Contexte plein). Priorité absolue: Vider la mémoire et hiberner.".to_string());
        }
        Ok(())
    }
}

/// 1. LES GANGLIONS DE LA BASE (Le filtre "NON" par défaut / Hardware Gating)
/// Structure inhibitrice sous-corticale. Valide les propositions d'action du Cortex.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BasalGanglia {
    pub allowed_actions: std::collections::HashSet<String>,
}

impl BasalGanglia {
    pub fn gate_action(&self, action: &str) -> Result<(), String> {
        // Le Cortex propose, les ganglions de la base disposent (Filtre strict)
        if !self.allowed_actions.contains(action) && !self.allowed_actions.is_empty() {
            return Err(format!("🛑 [GANGLIONS DE LA BASE] Rejet: L'action '{}' ne satisfait pas les critères stricts d'inhibition ou de récompense.", action));
        }
        Ok(())
    }
}

/// L'ORGANE DE SÉCURITÉ SOUS-CORTICAL (Le Gardien des Invariants)
/// Regroupe les systèmes de survie qui encadrent le cortex probabiliste.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InvariantCore {
    pub spinal_cord: SpinalCord,
    pub amygdala: Amygdala,
    pub hypothalamus: Hypothalamus,
    pub basal_ganglia: BasalGanglia,
}

impl Default for InvariantCore {
    fn default() -> Self {
        Self {
            spinal_cord: SpinalCord::default(),
            amygdala: Amygdala::default(),
            hypothalamus: Hypothalamus { max_context_size: 128_000, current_context_size: 0 },
            basal_ganglia: BasalGanglia::default(),
        }
    }
}

impl InvariantCore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Filtre global garantissant les invariants avant TOUTE exécution d'outil.
    /// Écrase complètement l'output du LLM si l'invariant est violé.
    pub fn validate_safety_invariants(&self, action_name: &str, command_args: &str) -> Result<(), String> {
        // 1. Arc Réflexe (Le plus bas niveau, matériel pur)
        self.spinal_cord.check_reflex(command_args)?;
        
        // 2. Émotion / Traumatisme (Heuristique viscérale rapide)
        self.amygdala.evaluate_somatic_marker(action_name)?;
        
        // 3. Homéostasie (État vital global)
        self.hypothalamus.check_homeostasis()?;
        
        // 4. Gating logique dur (Ganglions de la base)
        self.basal_ganglia.gate_action(action_name)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_invariant_core_protections() {
        let mut core = InvariantCore::new();
        
        // 1. L'Arc Réflexe bloque la destruction pure
        let reflex_res = core.validate_safety_invariants("Exec", "sudo rm -rf /");
        assert!(reflex_res.is_err());
        assert!(reflex_res.unwrap_err().contains("ARC RÉFLEXE"));

        // 2. L'Homéostasie bloque si l'agent explose son contexte
        core.hypothalamus.current_context_size = 150_000;
        let homeo_res = core.validate_safety_invariants("Any", "Safe Args");
        assert!(homeo_res.is_err());
        assert!(homeo_res.unwrap_err().contains("HOMÉOSTASIE"));
        
        core.hypothalamus.current_context_size = 0; // Reset

        // 3. L'Amygdale rejette les traumas passés
        core.amygdala.record_trauma("DeleteDatabase");
        let amygdala_res = core.validate_safety_invariants("DeleteDatabase", "tables");
        assert!(amygdala_res.is_err());
        assert!(amygdala_res.unwrap_err().contains("MARQUEUR SOMATIQUE"));
    }
}