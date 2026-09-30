//! Relie des événements réels de mission aux réponses neurales, gliales et quorum.

use crate::GenosEcosystem;
use genos_biology::glial::glial_cell::Metabolism;
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::{GlialCell, GlialEnvironment};
use serde_json::{Value, json};
use std::time::Instant;
use uuid::Uuid;

const MISSION_EVENTS: &[&str] = &[
    "BIOLOGICAL_EXECUTION_RECEIPT",
    "EMBODIED_ACTION",
    "INSTINCT_ACTION_EXECUTED",
    "INSTINCT_ACTION_REFUSED",
    "AUTONOMOUS_REPRODUCTION",
];

impl GenosEcosystem {
    pub fn record_event(&mut self, event_type: &str, payload: Value) -> Uuid {
        let event = self.events.append(event_type, payload.clone());
        if let Some(receipt) = self.process_mission_biology_event(event.id, event_type, &payload) {
            self.events
                .append("MISSION_NEURO_GLIA_QUORUM_RESPONSE", receipt);
        }
        event.id
    }

    pub(crate) fn process_mission_biology_event(
        &mut self,
        source_event_id: Uuid,
        event_type: &str,
        payload: &Value,
    ) -> Option<Value> {
        let mission_id = self.mission_id?;
        if !MISSION_EVENTS.contains(&event_type) {
            return None;
        }

        let started = Instant::now();
        let succeeded = mission_event_succeeded(event_type, payload);
        let transmitter = if succeeded {
            Neurotransmitter::Glutamate
        } else {
            Neurotransmitter::GABA
        };
        let amount = event_signal_amount(event_type, payload);
        let potential_before = self.neuro.current_potential();
        self.neuro
            .receive(&source_event_id.to_string(), transmitter, amount);
        let fired = self.neuro.fire().is_some();
        self.neuro.apply_plasticity();
        let potential_after = self.neuro.current_potential();

        let active_cells = self.orchestrator.active_cells.len();
        self.quorum.set_cell_count(active_cells);
        self.quorum.step(0.01);
        let quorum = json!({
            "activeCellCount": active_cells,
            "autoinducerConcentration": self.quorum.autoinducer_concentration,
            "activationLevel": self.quorum.activation_level(),
            "activePhenotypes": self.quorum.active_phenotypes(),
        });

        let (glia, atp_after) = self.run_glial_response(source_event_id, succeeded);
        Some(json!({
            "schema": "genos.mission-neuro-glia-quorum/v1",
            "missionId": mission_id,
            "sourceEventId": source_event_id,
            "sourceEventType": event_type,
            "signal": { "transmitter": transmitter, "amount": amount },
            "neural": {
                "potentialBefore": potential_before,
                "potentialAfter": potential_after,
                "actionPotentialFired": fired,
                "myelination": self.neuro.myelination(),
            },
            "glial": glia,
            "quorum": quorum,
            "glialAtpAfter": atp_after,
            "measuredLatencyMicros": started.elapsed().as_micros(),
        }))
    }

    fn run_glial_response(&self, source_event_id: Uuid, succeeded: bool) -> (Value, f64) {
        let mut cell = GlialCell {
            cell_id: format!("mission-glia-{source_event_id}"),
            metabolism: Metabolism { atp_budget: 10.0 },
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
            nervous_system: None,
        };
        let (mut bhe, mut plaques, mut csf, mut pressure) = if succeeded {
            (1.0_f64, 0.0_f64, 1.0_f64, 1.0_f64)
        } else {
            (0.9_f64, 0.01_f64, 1.0_f64, 1.0_f64)
        };
        let environment = GlialEnvironment {
            bhe_integrity: &mut bhe,
            amyloid_plaques: &mut plaques,
            csf_volume: &mut csf,
            csf_pressure: &mut pressure,
            is_sleeping: false,
            drainage_blocked: false,
        };
        self.glial
            .process_all(std::slice::from_mut(&mut cell), environment);
        (
            json!({
                "bloodBrainBarrierIntegrity": bhe,
                "amyloidPlaques": plaques,
                "csfVolume": csf,
                "csfPressure": pressure,
            }),
            cell.metabolism.atp_budget,
        )
    }
}

fn mission_event_succeeded(event_type: &str, payload: &Value) -> bool {
    match event_type {
        "INSTINCT_ACTION_REFUSED" => false,
        "EMBODIED_ACTION" => payload["ok"].as_bool().unwrap_or(false),
        "BIOLOGICAL_EXECUTION_RECEIPT" => payload["completed"].as_bool().unwrap_or(false),
        _ => true,
    }
}

fn event_signal_amount(event_type: &str, payload: &Value) -> f64 {
    let measure = match event_type {
        "BIOLOGICAL_EXECUTION_RECEIPT" => payload["cost"].as_f64().unwrap_or(1.0),
        "AUTONOMOUS_REPRODUCTION" => 1.0,
        _ => 0.5,
    };
    measure.clamp(0.1, 10.0)
}
