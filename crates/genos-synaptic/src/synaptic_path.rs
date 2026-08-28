#[derive(Debug, Clone, PartialEq)]
pub enum SynapticLevel {
    /// Niveau 1: Le Passage Transitoire
    /// Pas de mémoire, simple transmission chimique.
    Transient { neurotransmitters: f32 },
    
    /// Niveau 2: Le Renforcement Dynamique (LTP)
    /// Synchronisation, l'activité répétée crée la potentialisation à long terme.
    DynamicLTP { potentiation: f32 },
    
    /// Niveau 3: La Trace Physique
    /// Changement structurel durable (augmentation des récepteurs).
    PhysicalTrace { receptors: u32, efficiency: f32 },
}

pub struct SynapticPath {
    pub pre_id: String,
    pub post_id: String,
    pub level: SynapticLevel,
}

impl SynapticPath {
    /// Crée un nouveau chemin au niveau 1
    pub fn new(pre_id: &str, post_id: &str) -> Self {
        Self {
            pre_id: pre_id.to_string(),
            post_id: post_id.to_string(),
            level: SynapticLevel::Transient { neurotransmitters: 0.0 },
        }
    }

    /// Simule l'arrivée d'une impulsion (Niveau 1 vers Niveau 2)
    pub fn trigger_impulse(&mut self, intensity: f32) {
        match &mut self.level {
            SynapticLevel::Transient { neurotransmitters } => {
                *neurotransmitters += intensity;
                // Si la libération est suffisante, on passe en LTP (Niveau 2)
                if *neurotransmitters > 1.0 {
                    self.level = SynapticLevel::DynamicLTP { potentiation: 1.0 };
                }
            }
            SynapticLevel::DynamicLTP { potentiation } => {
                // Renforcement (LTP)
                *potentiation += intensity * 1.5;
                // Si la LTP est très forte, on crée une trace physique (Niveau 3)
                if *potentiation > 5.0 {
                    self.level = SynapticLevel::PhysicalTrace { 
                        receptors: 5, 
                        efficiency: 2.0 
                    };
                }
            }
            SynapticLevel::PhysicalTrace { receptors, efficiency } => {
                // Augmentation des récepteurs si très sollicité
                *efficiency += intensity * 0.2;
                if *efficiency > 5.0 {
                    *receptors = receptors.saturating_add(1);
                    *efficiency = 2.0; // Reset partiel de l'efficacité par récepteur
                }
            }
        }
    }

    /// Applique l'oubli et le pruning (Niveau 3 vers Niveau 1)
    pub fn apply_decay(&mut self) {
        match &mut self.level {
            SynapticLevel::Transient { neurotransmitters } => {
                *neurotransmitters = (*neurotransmitters - 0.2).max(0.0);
            }
            SynapticLevel::DynamicLTP { potentiation } => {
                *potentiation = (*potentiation - 0.5).max(0.0);
                if *potentiation == 0.0 {
                    self.level = SynapticLevel::Transient { neurotransmitters: 0.5 };
                }
            }
            SynapticLevel::PhysicalTrace { receptors, efficiency } => {
                *efficiency = (*efficiency - 0.1).max(0.0);
                if *efficiency == 0.0 {
                    *receptors = receptors.saturating_sub(1);
                    if *receptors == 0 {
                        // Perte de la trace physique, retour au LTP faible
                        self.level = SynapticLevel::DynamicLTP { potentiation: 1.0 };
                    } else {
                        *efficiency = 1.0;
                    }
                }
            }
        }
    }

    /// Renvoie une pondération équivalente pour le graphe STDP classique
    pub fn effective_weight(&self) -> f32 {
        match &self.level {
            SynapticLevel::Transient { neurotransmitters } => *neurotransmitters * 0.1,
            SynapticLevel::DynamicLTP { potentiation } => *potentiation,
            SynapticLevel::PhysicalTrace { receptors, efficiency } => {
                (*receptors as f32) * (*efficiency)
            }
        }
    }
}
