//! Branche les cellules spécialisées au runtime avec des reçus mesurables.

use crate::GenosEcosystem;
use genos_biology::{
    ObserverPerspective, OssificationReport, RawSignalPacket, SiftingResult, ThrottleResult,
};
use serde_json::json;
use std::time::Instant;
use uuid::Uuid;

struct GuardResourceAssessment {
    cell_id: Uuid,
    atp_available: f64,
    availability: f64,
}

struct GuardFluxFundingRequest {
    cell_id: Uuid,
    cost: f64,
    atp_available: f64,
}

struct GuardFluxReceiptData {
    mission_id: Option<Uuid>,
    pore_id: String,
    requested_flux: f64,
    result: ThrottleResult,
    cost: f64,
    atp_available: f64,
    resource_availability: f64,
    accepted: bool,
    pool_failure_reason: Option<String>,
    pool_receipt: Option<crate::metabolism::MissionMetabolicPoolReceipt>,
}

fn guard_resource_availability(eco: &mut GenosEcosystem) -> GuardResourceAssessment {
    eco.orchestrator.metabolism.refill();
    let atp_capacity = eco.orchestrator.metabolism.capacity;
    let atp_available = eco.orchestrator.metabolism.available();
    let atp_ratio = if atp_capacity > 0.0 {
        (atp_available / atp_capacity).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let cell_id = eco.orchestrator.orchestrator_id;
    let pool_amount = eco
        .orchestrator
        .active_cells
        .get(&cell_id)
        .map(|cell| cell.metabolism.amino_acids)
        .unwrap_or_default();
    let pool_ratio = if pool_amount.is_finite() {
        (pool_amount / 100.0).clamp(0.0, 1.0)
    } else {
        0.0
    };
    GuardResourceAssessment {
        cell_id,
        atp_available,
        availability: pool_ratio.min(atp_ratio),
    }
}

fn close_guard_flux(result: &mut ThrottleResult, requested_flux: f64) {
    result.admitted_flux = 0.0;
    result.throttled_flux = requested_flux;
    result.backpressure_active = true;
    result.status = "STOMATA_CLOSED_METABOLIC_POOL_REFUSED".to_string();
}

fn fund_guard_flux(
    eco: &mut GenosEcosystem,
    request: GuardFluxFundingRequest,
) -> Result<crate::metabolism::MissionMetabolicPoolReceipt, String> {
    if !request.cost.is_finite() || request.cost < 0.0 {
        return Err("invalid guard flux cost".to_string());
    }
    if request.atp_available + 1e-9 < request.cost {
        return Err("insufficient ATP energy reserve".to_string());
    }
    let receipt = eco.consume_mission_metabolic_pool(
        crate::metabolism::MissionMetabolicPoolDemand {
            cell_id: request.cell_id,
            operation: "guard_cell.admitted_flux".to_string(),
            amino_acids: request.cost,
        },
    )?;
    if receipt.accepted {
        eco.orchestrator
            .metabolism
            .consume_for("guard_cell.admitted_flux", request.cost);
    }
    Ok(receipt)
}

fn record_guard_flux(eco: &mut GenosEcosystem, data: GuardFluxReceiptData) {
    eco.record_event(
        "GUARD_CELL_FLUX_ENFORCED",
        json!({
            "schema": "genos.guard-cell-flux-receipt/v1",
            "missionId": data.mission_id,
            "poreId": data.pore_id,
            "requestedFlux": data.requested_flux,
            "admittedFlux": data.result.admitted_flux,
            "throttledFlux": data.result.throttled_flux,
            "metabolicCostAminoAcids": if data.accepted { data.cost } else { 0.0 },
            "atpCost": if data.accepted { data.cost } else { 0.0 },
            "atpAvailableBefore": data.atp_available,
            "resourceAvailability": data.resource_availability,
            "accepted": data.accepted,
            "poolFailureReason": data.pool_failure_reason,
            "poolReceipt": data.pool_receipt,
            "status": data.result.status,
        }),
    );
}

impl GenosEcosystem {
    /// Ossifie le pipeline, mesure son coût et enregistre son plan exécutable versionné.
    pub fn ossify_pipeline(&mut self, pipeline_id: &str) -> Result<OssificationReport, String> {
        let started = Instant::now();
        let before = self.tracheid.transport_sap_stream(1.0, 0.0)?;
        let report = self.tracheid.trigger_lignified_apoptosis(pipeline_id)?;
        let after = self.tracheid.transport_sap_stream(1.0, 0.0)?;
        let artifact = json!({
            "schema": "genos.tracheid-execution-plan/v1",
            "artifactKind": "runtime_plan",
            "pipelineId": pipeline_id,
            "operations": ["check_cavitation", "pass_through_or_block"],
            "cavitationResistanceMpa": self.tracheid.plate.cavitation_resistance_mpa,
        });
        self.record_event(
            "TRACHEID_PIPELINE_OSSIFIED",
            json!({
                "schema": "genos.tracheid-ossification-receipt/v1",
                "missionId": self.mission_id,
                "tracheidId": self.tracheid.id,
                "report": report,
                "compiledPlan": artifact,
                "comparisonInputVolume": 1.0,
                "livingCost": before.token_cost,
                "ossifiedCost": after.token_cost,
                "livingThroughput": before.transported_volume,
                "ossifiedThroughput": after.transported_volume,
                "measuredLatencyMicros": started.elapsed().as_micros(),
            }),
        );
        Ok(report)
    }

    /// Applique le backpressure puis débite le pool de matière première de la mission.
    pub fn throttle_flux(&mut self, requested_flux: f64) -> ThrottleResult {
        let resources = guard_resource_availability(self);
        self.guard_cell
            .regulate(resources.availability, 1.0 - resources.availability);
        let valid_request = requested_flux.is_finite() && requested_flux >= 0.0;
        let mut result = self
            .guard_cell
            .throttle_flux(if valid_request { requested_flux } else { 0.0 });
        let cost = result.admitted_flux.max(0.0) * 0.01;
        let pool_receipt = if valid_request {
            fund_guard_flux(
                self,
                GuardFluxFundingRequest {
                    cell_id: resources.cell_id,
                    cost,
                    atp_available: resources.atp_available,
                },
            )
        } else {
            Err("invalid requested flux".to_string())
        };
        let accepted = pool_receipt.as_ref().is_ok_and(|receipt| receipt.accepted);
        if !accepted {
            close_guard_flux(&mut result, requested_flux);
        }
        record_guard_flux(
            self,
            GuardFluxReceiptData {
                mission_id: self.mission_id,
                pore_id: self.guard_cell.pore_id.clone(),
                requested_flux,
                result: result.clone(),
                cost,
                atp_available: resources.atp_available,
                resource_availability: resources.availability,
                accepted,
                pool_failure_reason: pool_receipt.as_ref().err().cloned(),
                pool_receipt: pool_receipt.ok(),
            },
        );
        result
    }

    /// Filtre le flux et émet les métriques de débit, rétention et perte.
    pub fn filter_stream(&mut self, packets: &[RawSignalPacket]) -> SiftingResult {
        let result = self.choanocyte.sift_stream(packets);
        self.record_event(
            "CHOANOCYTE_STREAM_FILTERED",
            json!({
                "schema": "genos.choanocyte-stream-receipt/v1",
                "missionId": self.mission_id,
                "cellId": self.choanocyte.id,
                "scanned": result.total_scanned,
                "retained": result.retained_signals.len(),
                "rejectedNoise": result.rejected_noise_count,
                "retentionRatio": ratio(result.retained_signals.len(), result.total_scanned),
                "lossRatio": ratio(result.rejected_noise_count, result.total_scanned),
                "flow": result.generated_flow,
            }),
        );
        result
    }

    /// Rend les données et consigne la conformité au format demandé.
    pub fn render_polymorphic(
        &mut self,
        raw_data: &str,
        perspective: &ObserverPerspective,
    ) -> String {
        let rendered = self.iridophore.render_polymorphic(raw_data, perspective);
        let conforms = render_conforms(&rendered, perspective);
        self.record_event(
            "IRIDOPHORE_RENDERED",
            json!({
                "schema": "genos.iridophore-render-receipt/v1",
                "missionId": self.mission_id,
                "cellId": self.iridophore.id,
                "perspective": perspective,
                "conforms": conforms,
                "renderedBytes": rendered.len(),
            }),
        );
        rendered
    }
}

fn ratio(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        return 0.0;
    }
    numerator as f64 / denominator as f64
}

fn render_conforms(rendered: &str, perspective: &ObserverPerspective) -> bool {
    match perspective {
        ObserverPerspective::StructuredJson => serde_json::from_str::<serde_json::Value>(rendered)
            .map(|value| {
                value["iridophore_id"].is_string()
                    && value["spectral_band_nm"].is_number()
                    && value["color_hue"].is_string()
                    && value["payload"].is_string()
            })
            .unwrap_or(false),
        ObserverPerspective::TuiAnsi => rendered.contains("[IRIDOPHORE:")
            && rendered.contains("\x1b[0m"),
        ObserverPerspective::MarkdownVisual => rendered.starts_with("**[")
            && rendered.contains(" nm`)"),
        ObserverPerspective::CrypticCamouflage => {
            rendered.starts_with("CLOAKED_POLYMORPHIC_")
        }
    }
}
