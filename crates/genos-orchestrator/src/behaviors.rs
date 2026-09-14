//! Comportements avancés exécutés par l'orchestrateur : feinte (ADN leurre),
//! pipeline glial complet, communication via le thalamus.

use crate::GenosEcosystem;
use crate::dna_ops;
use genos_biology::glial::glial_cell::Metabolism;
use genos_biology::{GlialCell, GlialEnvironment};
use genos_dna::operations::DecoyOptions;
use uuid::Uuid;

impl GenosEcosystem {
    /// Feinte : insère un leurre (decoy) dans l'ADN d'un agent.
    pub fn feign(&mut self, agent: Uuid) -> String {
        let Some(dna) = self.agent_dna.get(&agent).cloned() else {
            return "aucun ADN enregistre : feinte impossible".to_string();
        };
        let options = DecoyOptions {
            target_selector: "predator".to_string(),
            detectability: 0.2,
            marker: b"decoy".to_vec(),
        };
        match dna_ops::decoy_dna(&dna, &options) {
            Ok(decoyed) => {
                self.agent_dna.insert(agent, decoyed);
                "feinte appliquee (ADN leurre)".to_string()
            }
            Err(error) => format!("feinte echouee : {error}"),
        }
    }

    /// Exécute le pipeline glial complet (collecte, agrégation, application).
    pub fn glial_pass(&self) -> String {
        let mut cell = GlialCell {
            cell_id: "glial-0".to_string(),
            metabolism: Metabolism { atp_budget: 10.0 },
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
            nervous_system: None,
        };
        let (mut bhe, mut plaques, mut csf, mut pressure) = (1.0_f64, 0.0, 1.0, 1.0);
        let env = GlialEnvironment {
            bhe_integrity: &mut bhe,
            amyloid_plaques: &mut plaques,
            csf_volume: &mut csf,
            csf_pressure: &mut pressure,
            is_sleeping: false,
            drainage_blocked: false,
        };
        self.glial.process_all(std::slice::from_mut(&mut cell), env);
        format!("pipeline glial execute (BHE {bhe:.2})")
    }

    /// Communication : consultée via le thalamus (LLM) si la feature `api` est active.
    pub fn communicate(&self, prompt: &str) -> String {
        #[cfg(feature = "api")]
        {
            crate::thalamus::consult(prompt, 1)
        }
        #[cfg(not(feature = "api"))]
        {
            format!("escalade humaine (feature api desactivee) : {prompt}")
        }
    }
}
