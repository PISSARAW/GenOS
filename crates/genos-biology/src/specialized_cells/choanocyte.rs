use serde::{Deserialize, Serialize};

/// Paquet d'information brut circulant dans le flux environnemental
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawSignalPacket {
    pub id: String,
    pub size_nm: f64,
    pub semantic_density: f64,
    pub content: String,
    pub is_noise: bool,
}

/// Paquet de données capturé et métabolisé par la collerette du choanocyte
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedNutrientPacket {
    pub packet_id: String,
    pub ingested_content: String,
    pub atp_yield: f64,
    pub filtration_efficiency: f64,
}

/// Vecteur de flux hydrodynamique généré par le battement flagellaire
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HydrodynamicVector {
    pub flow_velocity_mm_s: f64,
    pub pumping_rate_ml_s: f64,
    pub suction_pressure_pa: f64,
    pub flagellar_beat_hz: f64,
}

/// Résultat du tamisage de flux continu
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiftingResult {
    pub total_scanned: usize,
    pub retained_signals: Vec<CapturedNutrientPacket>,
    pub rejected_noise_count: usize,
    pub generated_flow: HydrodynamicVector,
}

/// Cellule Choanocyte à collerette et flagelle pour l'aspiration et filtration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choanocyte {
    pub id: String,
    pub flagellar_beat_hz: f64,
    pub collar_microvilli_spacing_nm: f64,
    pub phagocytosed_nutrients: Vec<CapturedNutrientPacket>,
    pub is_pumping: bool,
}

impl Choanocyte {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            flagellar_beat_hz: 30.0,
            collar_microvilli_spacing_nm: 120.0,
            phagocytosed_nutrients: Vec::new(),
            is_pumping: true,
        }
    }

    /// Génère la dépression et le vecteur d'aspiration hydrodynamique
    pub fn generate_water_current(&self) -> HydrodynamicVector {
        if !self.is_pumping {
            return HydrodynamicVector {
                flow_velocity_mm_s: 0.0,
                pumping_rate_ml_s: 0.0,
                suction_pressure_pa: 0.0,
                flagellar_beat_hz: 0.0,
            };
        }

        let flow_velocity = (self.flagellar_beat_hz * 0.08).round();
        let pumping_rate = (self.flagellar_beat_hz * 0.015 * 100.0).round() / 100.0;
        let suction_pa = (self.flagellar_beat_hz * 1.25 * 10.0).round() / 10.0;

        HydrodynamicVector {
            flow_velocity_mm_s: flow_velocity,
            pumping_rate_ml_s: pumping_rate,
            suction_pressure_pa: suction_pa,
            flagellar_beat_hz: self.flagellar_beat_hz,
        }
    }

    /// Tamisage actif du flux de données via la collerette de microvillosités
    pub fn sift_stream(&mut self, packets: &[RawSignalPacket]) -> SiftingResult {
        let flow = self.generate_water_current();
        let mut retained = Vec::new();
        let mut rejected = 0;

        for p in packets {
            // Le tamisage retient les particules dont la taille est compatible avec le maillage
            // et dont la densité sémantique justifie l'ingestion (non-bruit)
            if p.size_nm >= self.collar_microvilli_spacing_nm && !p.is_noise && p.semantic_density >= 0.4 {
                let nutrient = CapturedNutrientPacket {
                    packet_id: p.id.clone(),
                    ingested_content: p.content.clone(),
                    atp_yield: (p.semantic_density * 10.0).round(),
                    filtration_efficiency: ((p.size_nm / (p.size_nm + 10.0)) * 100.0).round() / 100.0,
                };
                self.phagocytosed_nutrients.push(nutrient.clone());
                retained.push(nutrient);
            } else {
                rejected += 1;
            }
        }

        SiftingResult {
            total_scanned: packets.len(),
            retained_signals: retained,
            rejected_noise_count: rejected,
            generated_flow: flow,
        }
    }
}

/// Chambre aquifère complète regroupant un essaim de choanocytes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChoanodermChamber {
    pub chamber_id: String,
    pub choanocytes: Vec<Choanocyte>,
}

impl ChoanodermChamber {
    pub fn new(chamber_id: &str, count: usize) -> Self {
        let choanocytes = (0..count)
            .map(|i| Choanocyte::new(&format!("{}_choano_{}", chamber_id, i)))
            .collect();

        Self {
            chamber_id: chamber_id.to_string(),
            choanocytes,
        }
    }

    pub fn total_pumping_rate_ml_s(&self) -> f64 {
        self.choanocytes.iter()
            .map(|c| c.generate_water_current().pumping_rate_ml_s)
            .sum()
    }

    pub fn sift_stream_collective(&mut self, packets: &[RawSignalPacket]) -> SiftingResult {
        if self.choanocytes.is_empty() {
            return SiftingResult {
                total_scanned: packets.len(),
                retained_signals: Vec::new(),
                rejected_noise_count: packets.len(),
                generated_flow: HydrodynamicVector {
                    flow_velocity_mm_s: 0.0,
                    pumping_rate_ml_s: 0.0,
                    suction_pressure_pa: 0.0,
                    flagellar_beat_hz: 0.0,
                },
            };
        }

        let mut total_retained = Vec::new();
        let mut total_rejected = 0;
        let chunk_size = (packets.len() / self.choanocytes.len()).max(1);

        for (i, choanocyte) in self.choanocytes.iter_mut().enumerate() {
            let start = (i * chunk_size).min(packets.len());
            let end = ((i + 1) * chunk_size).min(packets.len());
            if start < end {
                let sub_res = choanocyte.sift_stream(&packets[start..end]);
                total_retained.extend(sub_res.retained_signals);
                total_rejected += sub_res.rejected_noise_count;
            }
        }

        let base_flow = self.choanocytes[0].generate_water_current();
        let total_flow = HydrodynamicVector {
            flow_velocity_mm_s: base_flow.flow_velocity_mm_s,
            pumping_rate_ml_s: self.total_pumping_rate_ml_s(),
            suction_pressure_pa: base_flow.suction_pressure_pa * (self.choanocytes.len() as f64).sqrt(),
            flagellar_beat_hz: base_flow.flagellar_beat_hz,
        };

        SiftingResult {
            total_scanned: packets.len(),
            retained_signals: total_retained,
            rejected_noise_count: total_rejected,
            generated_flow: total_flow,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_choanocyte_flagellar_current_and_sifting() {
        let mut choano = Choanocyte::new("sponge_choano_1");
        let flow = choano.generate_water_current();
        assert_eq!(flow.flagellar_beat_hz, 30.0);
        assert!(flow.pumping_rate_ml_s > 0.0);
        assert!(flow.suction_pressure_pa > 0.0);

        let stream = vec![
            RawSignalPacket {
                id: "sig_1".into(),
                size_nm: 150.0, // > 120 nm mesh
                semantic_density: 0.85,
                content: "CRITICAL_SYSTEM_EVENT".into(),
                is_noise: false,
            },
            RawSignalPacket {
                id: "sig_2_noise".into(),
                size_nm: 50.0, // < 120 nm mesh
                semantic_density: 0.1,
                content: "DEBUG_PING".into(),
                is_noise: true,
            },
            RawSignalPacket {
                id: "sig_3".into(),
                size_nm: 200.0,
                semantic_density: 0.65,
                content: "METRIC_TELEMETRY".into(),
                is_noise: false,
            },
        ];

        let result = choano.sift_stream(&stream);
        assert_eq!(result.total_scanned, 3);
        assert_eq!(result.retained_signals.len(), 2);
        assert_eq!(result.rejected_noise_count, 1);
        assert_eq!(choano.phagocytosed_nutrients.len(), 2);
    }

    #[test]
    fn test_choanoderm_chamber_collective_pumping() {
        let mut chamber = ChoanodermChamber::new("chamber_alpha", 10);
        let total_pumping = chamber.total_pumping_rate_ml_s();
        assert!((total_pumping - 4.5).abs() < 0.1);

        let stream: Vec<RawSignalPacket> = (0..20)
            .map(|i| RawSignalPacket {
                id: format!("packet_{}", i),
                size_nm: if i % 2 == 0 { 160.0 } else { 80.0 },
                semantic_density: if i % 2 == 0 { 0.9 } else { 0.2 },
                content: format!("Payload {}", i),
                is_noise: i % 2 != 0,
            })
            .collect();

        let result = chamber.sift_stream_collective(&stream);
        assert_eq!(result.total_scanned, 20);
        assert_eq!(result.retained_signals.len(), 10);
        assert_eq!(result.rejected_noise_count, 10);
    }
}
