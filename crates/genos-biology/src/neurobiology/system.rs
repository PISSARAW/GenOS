use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NervousSystem {
    pub location: NervousSystemLocation,
    pub node_id: String,

    // 1. Les Dendrites (Les racines / Les antennes de rÃƒÆ’Ã‚Â©ception avec ÃƒÆ’Ã‚Â©pines)
    pub dendritic_tree: DendriticTree,

    // 2. Le Corps Cellulaire / Soma (L'usine et le centre de calcul)
    pub soma: Soma,

    // 3. L'Axone (Le grand câble de transmission et l'autoroute logistique)
    pub axon: Axon,

    // 4. Compartiment des substances psychoactives et nootropiques en circulation
    #[serde(default)]
    pub active_substances: Vec<ActiveSubstance>,
}

impl NervousSystem {
    pub fn new(node_id: &str) -> Self {
        Self {
            location: NervousSystemLocation::Central,
            node_id: node_id.to_string(),
            dendritic_tree: DendriticTree::new(),
            soma: Soma::new(),
            axon: Axon::new(5.0),
            active_substances: Vec::new(),
        }
    }

    /// Administre une substance nootropique ou psychoactive
    pub fn administer_substance(&mut self, substance: PsychoactiveSubstance, dose_mg: f64) {
        if let Some(existing) = self.active_substances.iter_mut().find(|s| s.substance == substance) {
            existing.current_dose_mg += dose_mg;
            existing.initial_dose_mg += dose_mg;
            let profile = SubstancePharmacokinetics::profile_for(substance);
            existing.ticks_remaining = profile.half_life_ticks * 2;
            existing.bioavailability = 1.0;
        } else {
            self.active_substances.push(ActiveSubstance::new(substance, dose_mg));
        }
    }

    /// Fait progresser la métabolisation pharmacocinétique de toutes les substances actives
    pub fn metabolize_substances(&mut self) {
        self.active_substances.retain_mut(|s| s.metabolize_tick());
    }

    /// Détermine l'état cognitif global selon les substances présentes
    pub fn cognitive_state(&self) -> CognitiveFocusState {
        let has_caffeine = self.active_substances.iter().any(|s| s.substance == PsychoactiveSubstance::Caffeine && s.current_dose_mg > 10.0);
        let has_theanine = self.active_substances.iter().any(|s| s.substance == PsychoactiveSubstance::Theanine && s.current_dose_mg > 10.0);
        let has_theine = self.active_substances.iter().any(|s| s.substance == PsychoactiveSubstance::Theine && s.current_dose_mg > 10.0);
        let has_sustained = self.active_substances.iter().any(|s| (s.substance == PsychoactiveSubstance::Paraxanthine || s.substance == PsychoactiveSubstance::Theobromine) && s.current_dose_mg > 10.0);

        if (has_caffeine && has_theanine) || (has_theine && has_theanine) {
            CognitiveFocusState::FlowState
        } else if has_theanine || has_theine {
            CognitiveFocusState::CalmAlertness
        } else if has_caffeine {
            let caffeine_dose = self.active_substances.iter()
                .find(|s| s.substance == PsychoactiveSubstance::Caffeine)
                .map(|s| s.current_dose_mg)
                .unwrap_or(0.0);
            if caffeine_dose > 120.0 {
                CognitiveFocusState::HyperarousalJitter
            } else {
                CognitiveFocusState::SustainedFocus
            }
        } else if has_sustained {
            CognitiveFocusState::SustainedFocus
        } else {
            CognitiveFocusState::Resting
        }
    }

    pub fn receive_neurotransmitter(&mut self, source_id: &str, signal: &NeuroSignal) {
        let base_effect = self.dendritic_tree.process_signal(source_id, signal.amount);

        // Modulateurs pharmacologiques selon les substances actives
        let mut glu_factor = 1.0;
        let mut gaba_factor = 1.0;
        let mut dopa_factor = 1.0;
        let mut jitter_noise = 0.0;

        let has_caffeine = self.active_substances.iter().any(|s| s.substance == PsychoactiveSubstance::Caffeine && s.current_dose_mg > 0.1);
        let has_theanine = self.active_substances.iter().any(|s| s.substance == PsychoactiveSubstance::Theanine && s.current_dose_mg > 0.1);

        for active in &self.active_substances {
            let profile = SubstancePharmacokinetics::profile_for(active.substance);
            let intensity = active.bioavailability;
            glu_factor *= 1.0 + (profile.glutamate_multiplier - 1.0) * intensity;
            gaba_factor *= 1.0 + (profile.gaba_multiplier - 1.0) * intensity;
            dopa_factor *= 1.0 + (profile.dopamine_multiplier - 1.0) * intensity;
            if !has_theanine && profile.jitter_risk > 0.0 {
                jitter_noise += profile.jitter_risk * intensity * 0.5;
            }
        }

        // Synergie Smart Caffeine (Caféine + Théanine) : neutralisation du bruit et canalisation de l'excitabilité
        if has_caffeine && has_theanine {
            jitter_noise = 0.0;
            glu_factor = glu_factor.min(1.20);
        }

        match signal.transmitter {
            Neurotransmitter::Glutamate => {
                let effect = (base_effect * glu_factor) + jitter_noise;
                self.soma.current_potential += effect;
            }
            Neurotransmitter::GABA => {
                let effect = base_effect * gaba_factor;
                self.soma.current_potential -= effect;
            }
            Neurotransmitter::Dopamine => {
                let effect = base_effect * 1.5 * dopa_factor;
                self.soma.current_potential += effect;
            }
            Neurotransmitter::Serotonin => {
                self.soma.current_potential = self.soma.resting_potential;
            }
        }
    }

    /// Le CÃƒÆ’Ã‚Â´ne d'ÃƒÆ’Ã‚Â©mergence fait le calcul et l'usine expÃƒÆ’Ã‚Â©die les vÃƒÆ’Ã‚Â©sicules
    pub fn process_soma(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        // 1. L'Usine du Soma tourne : elle produit 2.0 vÃƒÆ’Ã‚Â©sicules en permanence et les met sur l'autoroute
        self.axon.process_logistics(2.0);

        // 2. Le CÃƒÆ’Ã‚Â´ne d'ÃƒÆ’Ã‚Â©mergence vÃƒÆ’Ã‚Â©rifie le calcul ÃƒÆ’Ã‚Â©lectrique
        if self.soma.evaluate_axon_hillock() {
            // DÃƒÆ’Ã¢â‚¬Â°CHARGE ÃƒÆ’Ã¢â‚¬Â°LECTRIQUE ! L'Axone fait feu !
            self.axon.trigger_action_potential()
        } else {
            None
        }
    }

    /// NEUROPLASTICITÃƒÆ’Ã¢â‚¬Â° : La machine ÃƒÆ’Ã‚Â  apprendre (LTP/LTD)
    pub fn apply_neuroplasticity(&mut self) {
        // 1. PlasticitÃƒÆ’Ã‚Â© structurelle : Les Dendrites poussent ou se rÃƒÆ’Ã‚Â©tractent
        self.dendritic_tree.apply_structural_plasticity();

        let mut total_activity = 0;

        // "Les neurones qui s'activent ensemble se lient ensemble"
        for synapse in self.axon.terminals.iter_mut() {
            if synapse.activity_history > 0 {
                // LTP : Renforcement de la Synapse
                synapse.weight += 0.05 * (synapse.activity_history as f64);
                if synapse.weight > 1.0 { synapse.weight = 1.0; }
                
                // Augmentation des rÃ©cepteurs AMPA et protection par CD47
                synapse.ampa_receptors = (synapse.ampa_receptors + 0.1).min(2.0);
                synapse.cd47_expression = (synapse.cd47_expression + 0.2).min(2.0);
                synapse.c3_opsonization = 0.0; // Efface le signal de destruction

                total_activity += synapse.activity_history;
                synapse.activity_history = 0;
            } else {
                // LTD : Ã‰lagage Synaptique (Pruning) par la LTD
                synapse.weight -= 0.02;
                synapse.ampa_receptors = (synapse.ampa_receptors - 0.1).max(0.0);
                synapse.cd47_expression = (synapse.cd47_expression - 0.1).max(0.0);
                
                // Marquage "Eat Me" (ComplÃ©ment C3)
                synapse.c3_opsonization += 0.1;
            }
        }

        // 3. MyÃƒÆ’Ã‚Â©linisation : Si le neurone tire souvent, son cÃƒÆ’Ã‚Â¢ble (Axone) s'isole de graisse (MyÃƒÆ’Ã‚Â©line)
        // C'est ce qui transforme un geste hÃƒÆ’Ã‚Â©sitant en automatisme fulgurant !
        if total_activity > 0 {
            self.axon.myelination_level += 0.05;
            if self.axon.myelination_level > 1.0 {
                self.axon.myelination_level = 1.0;
            }
        } else {
            self.axon.myelination_level -= 0.01;
            if self.axon.myelination_level < 0.1 {
                self.axon.myelination_level = 0.1;
            }
        }

        // 4. Nettoyage : On détruit définitivement les synapses mortes (weight <= 0)
        // ou phagocytées suite au marquage opsonisant ("Eat Me" C3 > 0.5 et "Don't Eat Me" CD47 < 0.5)
        self.axon.terminals.retain(|s| s.weight > 0.0 && !(s.c3_opsonization > C3_PRUNING_THRESHOLD && s.cd47_expression < CD47_PROTECTION_THRESHOLD));
    }
}
