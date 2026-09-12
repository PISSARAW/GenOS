use serde::{Deserialize, Serialize};

/// Fragment dispersé par coloration disruptive
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DisruptedFragment {
    pub fragment_id: u32,
    pub total_fragments: u32,
    pub payload_slice: String,
    pub contour_noise: String, // Bruit perturbateur brisant la silhouette lexicale
}

/// Coloration disruptive : rupture de contour d'instructions sensibles
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DisruptiveColoration {
    pub stripe_count: u32,
    pub noise_entropy_ratio: f64,
}

impl DisruptiveColoration {
    pub fn new(stripe_count: u32) -> Self {
        Self {
            stripe_count: stripe_count.max(2),
            noise_entropy_ratio: 0.35,
        }
    }

    /// Brise un payload continu en fragments contrastés impossibles à identifier isolément
    pub fn scatter_payload(&self, raw_instruction: &str) -> Vec<DisruptedFragment> {
        let chars: Vec<char> = raw_instruction.chars().collect();
        let chunk_size = (chars.len() + self.stripe_count as usize - 1) / self.stripe_count as usize;
        let mut fragments = Vec::new();

        let noise_patterns = [
            "zebra_high_contrast_stripe_A",
            "leopard_rosette_dispersion_B",
            "dappled_shadow_break_C",
            "contour_divergence_mask_D",
        ];

        for (i, chunk) in chars.chunks(chunk_size.max(1)).enumerate() {
            let slice: String = chunk.iter().collect();
            let noise = noise_patterns[i % noise_patterns.len()].to_string();
            fragments.push(DisruptedFragment {
                fragment_id: i as u32,
                total_fragments: self.stripe_count,
                payload_slice: slice,
                contour_noise: noise,
            });
        }
        fragments
    }

    /// Reconstitue la silhouette d'instruction après collecte des fragments
    pub fn reassemble_payload(&self, fragments: &[DisruptedFragment]) -> Result<String, String> {
        if fragments.is_empty() {
            return Err("Aucun fragment fourni".to_string());
        }
        let mut sorted = fragments.to_vec();
        sorted.sort_by_key(|f| f.fragment_id);

        let mut reconstructed = String::new();
        for fragment in sorted {
            reconstructed.push_str(&fragment.payload_slice);
        }
        Ok(reconstructed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disruptive_coloration_scattering_and_reassembly() {
        let disruptive = DisruptiveColoration::new(4);
        let secret = "TRANSACTION_BLOCK_SIGNATURE_998877";

        let fragments = disruptive.scatter_payload(secret);
        assert_eq!(fragments.len(), 4);

        // Aucun fragment individuel n'est égal au secret
        for frag in &fragments {
            assert_ne!(frag.payload_slice, secret);
            assert!(!frag.contour_noise.is_empty());
        }

        // Reconstitution parfaite
        let reassembled = disruptive.reassemble_payload(&fragments).expect("Reconstitution valide");
        assert_eq!(reassembled, secret);
    }
}
