//! Branche les cellules spécialisées au runtime avec des reçus mesurables.

use crate::GenosEcosystem;
use genos_biology::{RawSignalPacket, SiftingResult};
use serde_json::json;

impl GenosEcosystem {
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
}

fn ratio(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        return 0.0;
    }
    numerator as f64 / denominator as f64
}
