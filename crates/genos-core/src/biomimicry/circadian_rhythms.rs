//! Le Noyau Suprachiasmatique (NSC) et les Rythmes Circadiens
//!
//! Mécanisme biologique : L'NSC est l'horloge suprême du cerveau. Il ne crée pas le temps,
//! mais synchronise les horloges internes du corps (endogènes) avec le cycle externe 
//! via des signaux environnementaux (Zeitgebers, comme la lumière solaire).
//!
//! Mapping GenOS (Macro-timing) : L'agent alterne entre des phases Diurnes (haute activité, requêtes)
//! et Nocturnes (maintenance, Hippocampal Replay). L'NSC de GenOS reçoit des signaux de l'OS 
//! (ex: charge réseau, heure locale) pour "reset" ou prédire les transitions d'états.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CircadianPhase {
    /// Jour : Haute disponibilité, exécution d'outils, consommation LLM forte.
    Diurnal,
    /// Nuit : Consolidation (Hippocampal Replay), Garbage Collection, indexation.
    Nocturnal,
}

/// Les signaux externes (Zeitgebers) qui forcent la synchronisation de l'horloge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ZeitgeberSignal {
    /// Signal "Lumière" (ex: pic d'activité utilisateur, ou 08h00 du matin)
    Light,
    /// Signal "Obscurité" (ex: inactivité réseau depuis 1h, ou 23h00)
    Darkness,
}

/// Le Noyau Suprachiasmatique : L'Ancre Biologique du Temps (Macro-timing).
#[derive(Debug, Clone)]
pub struct SuprachiasmaticNucleus {
    pub agent_id: String,
    pub current_phase: CircadianPhase,
    /// Heure interne estimée de l'agent (en secondes depuis le dernier reset, cycle de 86400s).
    pub internal_time_seconds: u64,
}

impl SuprachiasmaticNucleus {
    pub fn new(agent_id: String, initial_phase: CircadianPhase) -> Self {
        Self {
            agent_id,
            current_phase: initial_phase,
            internal_time_seconds: 0,
        }
    }

    /// Le "Reset" : Calibre le rythme endogène à partir d'un signal externe fort.
    pub fn reset_clock(&mut self, signal: ZeitgeberSignal) {
        match signal {
            ZeitgeberSignal::Light => {
                self.current_phase = CircadianPhase::Diurnal;
                self.internal_time_seconds = 0; // Début du cycle de "jour"
            }
            ZeitgeberSignal::Darkness => {
                self.current_phase = CircadianPhase::Nocturnal;
                self.internal_time_seconds = 43200; // Début virtuel de la "nuit" (12h plus tard)
            }
        }
    }

    /// La Prédiction : Prédit le délai avant la prochaine transition de phase.
    /// Permet au système de se préparer (ex: finaliser les tâches avant la "nuit").
    pub fn predict_next_transition(&self) -> u64 {
        match self.current_phase {
            CircadianPhase::Diurnal => {
                // Temps restant avant la nuit (estimée à 43200s)
                if self.internal_time_seconds < 43200 {
                    43200 - self.internal_time_seconds
                } else {
                    0 // Transition imminente
                }
            }
            CircadianPhase::Nocturnal => {
                // Temps restant avant le jour (estimé à 86400s)
                if self.internal_time_seconds < 86400 {
                    86400 - self.internal_time_seconds
                } else {
                    0
                }
            }
        }
    }

    /// Fait avancer l'horloge interne (simulé par tick).
    pub fn tick(&mut self, elapsed_seconds: u64) {
        self.internal_time_seconds = (self.internal_time_seconds + elapsed_seconds) % 86400;
        
        // Auto-bascule si aucun Zeitgeber n'est reçu (rythme circadien par défaut)
        if self.internal_time_seconds >= 43200 && self.internal_time_seconds < 86400 && self.current_phase == CircadianPhase::Diurnal {
            self.current_phase = CircadianPhase::Nocturnal;
        } else if self.internal_time_seconds < 43200 && self.current_phase == CircadianPhase::Nocturnal {
            self.current_phase = CircadianPhase::Diurnal;
        }
    }

    pub fn can_execute_heavy_maintenance(&self) -> bool {
        self.current_phase == CircadianPhase::Nocturnal
    }
}
