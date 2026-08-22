//! Algorithmes d'organisation distribuée
//! Implémente les modèles inspirés de la nature : Pieuvre, Manchots, Lucioles.
//! Avec optimisations de tokens : JSON compact et FilePointer.

use std::collections::HashMap;

/// Pointeur vers un artefact (évite d'échanger les contenus bruts)
#[derive(Debug, Clone, PartialEq)]
pub struct FilePointer {
    pub path: String,
}

impl FilePointer {
    pub fn new(path: String) -> Self {
        Self { path }
    }
}

/// Message optimisé utilisant JSON compact et FilePointer
#[derive(Debug, Clone)]
pub struct CompactMessage {
    pub sender_id: String,
    pub payload_ptr: FilePointer,
}

impl CompactMessage {
    pub fn new(sender: String, path: String) -> Self {
        Self {
            sender_id: sender,
            payload_ptr: FilePointer::new(path),
        }
    }

    /// Sérialise le message en JSON très compact pour économiser les tokens
    pub fn to_json(&self) -> String {
        format!(
            r#"{{"s":"{}","p":"{}"}}"#,
            self.sender_id, self.payload_ptr.path
        )
    }
}

/// Représente un agent dans le système
#[derive(Debug, Clone, PartialEq)]
pub struct Agent {
    pub id: String,
    pub energy: u32,
    pub active: bool,
}

impl Agent {
    /// Crée un nouvel agent
    pub fn new(id: String, energy: u32) -> Self {
        Self {
            id,
            energy,
            active: true,
        }
    }

    /// Modifie l'état de l'agent
    pub fn set_active(&mut self, state: bool) {
        self.active = state;
    }
}

// -----------------------------------------------------------------------------
// 1. Modèle de la Pieuvre (Octopus) : Un cerveau central coordonne des bras autonomes.
// -----------------------------------------------------------------------------

/// Le cerveau central (cerveau de la pieuvre)
#[derive(Default)]
pub struct OctopusBrain {
    pub arms: HashMap<String, Agent>,
}

impl OctopusBrain {
    /// Initialise une nouvelle pieuvre
    pub fn new() -> Self {
        Self {
            arms: HashMap::new(),
        }
    }

    /// Attache un nouveau bras
    pub fn attach_arm(&mut self, arm: Agent) {
        self.arms.insert(arm.id.clone(), arm);
    }

    /// Envoie une tâche à un bras spécifique
    pub fn delegate_task(&mut self, arm_id: &str, task_cost: u32) -> bool {
        if let Some(arm) = self.arms.get_mut(arm_id) {
            if arm.active && arm.energy >= task_cost {
                arm.energy -= task_cost;
                return true;
            }
        }
        false
    }

    /// Envoie un message sérialisé à un bras (optimisation de tokens)
    pub fn send_msg(&self, msg: &CompactMessage) -> String {
        msg.to_json()
    }
}

// -----------------------------------------------------------------------------
// 2. Modèle des Manchots (Penguins) : Chaleur partagée et rotation
// -----------------------------------------------------------------------------

/// Un groupe de manchots se protégeant du froid
#[derive(Default)]
pub struct PenguinHuddle {
    pub members: Vec<Agent>,
}

impl PenguinHuddle {
    /// Initialise le groupe de manchots
    pub fn new() -> Self {
        Self {
            members: Vec::new(),
        }
    }

    /// Ajoute un manchot au groupe
    pub fn add_penguin(&mut self, penguin: Agent) {
        self.members.push(penguin);
    }

    /// Effectue une rotation pour partager l'énergie (chaleur)
    pub fn rotate_huddle(&mut self) {
        if self.members.is_empty() {
            return;
        }
        // Simule le transfert de chaleur: le premier passe à la fin
        let first = self.members.remove(0);
        self.members.push(first);
    }

    /// Distribue l'énergie de manière égale
    pub fn share_heat(&mut self) {
        let total_energy: u32 = self.members.iter().map(|m| m.energy).sum();
        let count = self.members.len() as u32;

        if let Some(avg_energy) = total_energy.checked_div(count) {
            for member in &mut self.members {
                member.energy = avg_energy;
            }
        }
    }
}

// -----------------------------------------------------------------------------
// 3. Modèle des Lucioles (Fireflies) : Synchronisation des signaux
// -----------------------------------------------------------------------------

/// Une luciole émettant des signaux
#[derive(Debug, Clone)]
pub struct Firefly {
    pub base: Agent,
    pub phase: u32, // phase du cycle de clignotement (0-100)
}

impl Firefly {
    pub fn new(id: String, phase: u32) -> Self {
        Self {
            base: Agent::new(id, 100),
            phase,
        }
    }

    /// Avance la phase de la luciole
    pub fn tick(&mut self, step: u32) {
        self.phase = (self.phase + step) % 100;
    }
}

/// Nuée de lucioles
pub struct FireflySwarm {
    pub bugs: Vec<Firefly>,
}

impl Default for FireflySwarm {
    fn default() -> Self {
        Self::new()
    }
}

impl FireflySwarm {
    pub fn new() -> Self {
        Self { bugs: Vec::new() }
    }

    pub fn add_firefly(&mut self, bug: Firefly) {
        self.bugs.push(bug);
    }

    /// Synchronise les lucioles
    pub fn synchronize(&mut self, sync_rate: u32) {
        if self.bugs.is_empty() {
            return;
        }

        // Calcule la phase moyenne
        let total_phase: u32 = self.bugs.iter().map(|b| b.phase).sum();
        let avg_phase = total_phase / (self.bugs.len() as u32);

        // Rapproche chaque luciole de la moyenne
        for bug in &mut self.bugs {
            if bug.phase < avg_phase {
                bug.phase += sync_rate.min(avg_phase - bug.phase);
            } else if bug.phase > avg_phase {
                bug.phase -= sync_rate.min(bug.phase - avg_phase);
            }
        }
    }
}
