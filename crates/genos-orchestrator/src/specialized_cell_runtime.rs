//! Branche les cellules spécialisées au runtime avec des reçus mesurables.

use crate::GenosEcosystem;
use genos_biology::{ObserverPerspective, RawSignalPacket, SiftingResult};
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
