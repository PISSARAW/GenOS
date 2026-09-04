
use crate::cell::Antibody;
use crate::signaling::Ligand;
use crate::orchestrator::{CleftMessage, PsychoactiveDrug};
use serde::{Deserialize, Serialize};

 pub trait ImmuneBehavior: Send + Sync {
    fn get_circulating_antibodies(&self) -> &[Antibody];
    fn get_circulating_antibodies_mut(&mut self) -> &mut Vec<Antibody>;
    fn get_immune_activation_level(&self) -> f64;
    fn set_immune_activation_level(&mut self, level: f64);
    fn get_il6_level(&self) -> f64;
    fn set_il6_level(&mut self, level: f64);
    fn is_il6_receptors_blocked(&self) -> bool;
    fn set_il6_receptors_blocked(&mut self, blocked: bool);
}

pub trait EndocrineBehavior: Send + Sync {
    fn get_corticosteroid_level(&self) -> f64;
    fn set_corticosteroid_level(&mut self, level: f64);
}

pub trait NervousBehavior: Send + Sync {
    fn get_blood_brain_barrier_integrity(&self) -> f64;
    fn get_synaptic_cleft(&mut self) -> &mut Vec<CleftMessage>;
    fn set_synaptic_cleft(&mut self, cleft: Vec<CleftMessage>);
    fn get_psychoactive_drugs(&self) -> &[PsychoactiveDrug];
}
 
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StandardImmuneSystem {
    pub circulating_antibodies: Vec<Antibody>,
    pub immune_activation_level: f64,
    pub il6_level: f64,
    pub il6_receptors_blocked: bool,
}

impl Default for StandardImmuneSystem {
    fn default() -> Self {
        Self {
            circulating_antibodies: vec![],
            immune_activation_level: 1.0,
            il6_level: 0.0,
            il6_receptors_blocked: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StandardEndocrineSystem {
    pub circulating_hormones: Vec<Ligand>,
    pub blood_glucose: f64,
    pub corticosteroid_level: f64,
}

impl Default for StandardEndocrineSystem {
    fn default() -> Self {
        Self {
            circulating_hormones: vec![],
            blood_glucose: 5.0,
            corticosteroid_level: 0.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StandardNervousSystem {
    pub synaptic_cleft: Vec<CleftMessage>,
    pub psychoactive_drugs: Vec<PsychoactiveDrug>,
    pub blood_brain_barrier_integrity: f64,
    pub amyloid_plaques: f64,
    pub cerebrospinal_fluid_volume: f64,
    pub cerebrospinal_fluid_pressure: f64,
    pub csf_drainage_blocked: bool,
}

impl Default for StandardNervousSystem {
    fn default() -> Self {
        Self {
            synaptic_cleft: vec![],
            psychoactive_drugs: vec![],
            blood_brain_barrier_integrity: 1.0,
            amyloid_plaques: 0.0,
            cerebrospinal_fluid_volume: 150.0,
            cerebrospinal_fluid_pressure: 10.0,
            csf_drainage_blocked: false,
        }
    }
}


impl ImmuneBehavior for StandardImmuneSystem {
    fn get_circulating_antibodies(&self) -> &[Antibody] { &self.circulating_antibodies }
    fn get_circulating_antibodies_mut(&mut self) -> &mut Vec<Antibody> { &mut self.circulating_antibodies }
    fn get_immune_activation_level(&self) -> f64 { self.immune_activation_level }
    fn set_immune_activation_level(&mut self, level: f64) { self.immune_activation_level = level; }
    fn get_il6_level(&self) -> f64 { self.il6_level }
    fn set_il6_level(&mut self, level: f64) { self.il6_level = level; }
    fn is_il6_receptors_blocked(&self) -> bool { self.il6_receptors_blocked }
    fn set_il6_receptors_blocked(&mut self, blocked: bool) { self.il6_receptors_blocked = blocked; }
}

impl EndocrineBehavior for StandardEndocrineSystem {
    fn get_corticosteroid_level(&self) -> f64 { self.corticosteroid_level }
    fn set_corticosteroid_level(&mut self, level: f64) { self.corticosteroid_level = level; }
}

impl NervousBehavior for StandardNervousSystem {
    fn get_blood_brain_barrier_integrity(&self) -> f64 { self.blood_brain_barrier_integrity }
    fn get_synaptic_cleft(&mut self) -> &mut Vec<CleftMessage> { &mut self.synaptic_cleft }
    fn set_synaptic_cleft(&mut self, cleft: Vec<CleftMessage>) { self.synaptic_cleft = cleft; }
    fn get_psychoactive_drugs(&self) -> &[PsychoactiveDrug] { &self.psychoactive_drugs }
}



use crate::cell::AgentCell;
use crate::orchestrator::conscience::Conscience;

/// Parcours tous les clones / cellules agents et applique l'évaluation de la Conscience.
/// Coupe les branches (cellules) qui sont entrées en apoptose.
pub fn process_conscience(conscience_model: &Conscience, cells: &mut Vec<AgentCell>) {
    cells.retain_mut(|cell| {
        // TODO: Extraire ces métriques depuis les logs ou le mind de l'agent
        // Pour l'instant, heuristique basique.
        let mut errors = 0;
        let mut progress = 1.0; // Progression naturelle

        // Si l'agent est en boucle (trop de traces sans rÃ©sultat) on le pÃ©nalise
        if let Some(mind) = cell.mind() {
            if mind.trace.sequence.len() > 50 {
                errors += 1;
            }
        }

        conscience_model.evaluate_branch(&mut cell.conscience, errors, progress);

        if cell.conscience.is_apoptotic {
            // La conscience a décidée que cette branche devait mourir
            println!("💀 [Apoptose Cognitive] La branche {} a Ã©tÃ© supprimÃ©e suite Ã  une dissonance cognitive dÃ©passant le seuil.", cell.cell_id);
            false // On la retire du vecteur (Death)
        } else {
            true // On la garde en vie
        }
    });
}

