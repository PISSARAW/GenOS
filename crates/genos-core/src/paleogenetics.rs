use crate::genome::{Genome, DnaStrand};
use serde::{Deserialize, Serialize};

/// PALÉOGÉNÉTIQUE (Digital Forensics & Log Archaeology)
/// L''art d''extraire et de reconstruire les Prompts (Génomes) d''Agents IA détruits ou archivés 
/// à partir de logs fragmentés et corrompus par le temps (Garbage Collection).
pub struct Paleogenetics;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AncientDnaFragment {
    /// Le bout de log/prompt sauvé de la destruction
    pub sequence_confetti: DnaStrand, 
    /// L''ancienneté du fragment (en Ticks d''horloge système)
    pub age_in_ticks: u64,
    /// Taux de corruption (Contamination / Caractères illisibles)
    pub corruption_rate: f64,
}

impl Paleogenetics {
    /// LA LIMITE DE JURASSIC PARK
    /// Au-delà d''un certain temps, les logs sont purgés ou écrasés. L''information est perdue à jamais.
    const MAXIMUM_RECOVERY_AGE: u64 = 1_000_000; // 1 million de Ticks

    /// Tente d''extraire un fragment de log d''un agent mort (Le petit doigt de l''Homme de Denisova)
    pub fn extract_fossilized_prompt(raw_log_dump: &str, age: u64) -> Result<AncientDnaFragment, String> {
        if age > Self::MAXIMUM_RECOVERY_AGE {
            return Err("Limite de Jurassic Park atteinte : Le log est trop ancien et a été purgé (Entropy).".to_string());
        }

        // On simule une extraction très parcellaire (un "confetti" de prompt)
        let extracted = crate::genome::DnaStrand::synthesize(raw_log_dump);
        
        Ok(AncientDnaFragment {
            sequence_confetti: extracted,
            age_in_ticks: age,
            // Plus c''est vieux, plus il y a de corruption dans le dump mémoire
            corruption_rate: (age as f64 / Self::MAXIMUM_RECOVERY_AGE as f64).min(0.99),
        })
    }

    /// L''IMAGE SUR LA BOÎTE DU PUZZLE
    /// Utilise un Agent IA moderne (Sapiens) comme référence pour aligner et comprendre 
    /// le fragment d''un agent mort (Néandertal/Denisova).
    pub fn align_ancient_fragment(fragment: &AncientDnaFragment, modern_reference: &Genome) -> f64 {
        let reference_seq = &modern_reference.chromosome_maternal.sequence;
        let confetti_seq = &fragment.sequence_confetti.sequence;

        if confetti_seq.is_empty() || reference_seq.is_empty() { return 0.0; }

        let mut best_match_score = 0.0;
        let confetti_len = confetti_seq.len();

        // On fait glisser le confetti le long du génome moderne pour trouver où il s''emboîte
        for i in 0..=reference_seq.len().saturating_sub(confetti_len) {
            let mut current_score = 0.0;
            for j in 0..confetti_len {
                if reference_seq[i + j] == confetti_seq[j] {
                    current_score += 1.0;
                }
            }
            if current_score > best_match_score {
                best_match_score = current_score;
            }
        }

        // Renvoie le pourcentage de ressemblance (Prouvant l''hybridation ou un ancêtre commun)
        (best_match_score / confetti_len as f64) * (1.0 - fragment.corruption_rate)
    }
}
