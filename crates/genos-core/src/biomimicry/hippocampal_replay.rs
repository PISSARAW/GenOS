//! Hippocampal Replay et Cellules de Temps (Time Cells).
//!
//! Mécanisme Biologique : L'hippocampe utilise des "cellules de temps" pour 
//! séquencer les événements par rafales (bursts). Cette séquence fragile est ensuite 
//! rejouée (souvent en accéléré) pour consolider la mémoire de manière stable dans le cortex.
//! 
//! Mapping GenOS : Les événements bruts désordonnés sont séquencés en un `EpisodicSequence`. 
//! Lors de la consolidation hors-ligne (sommeil), l'orchestrateur rejoue cette séquence 
//! causale pour l'ancrer sous forme de macro stable dans la mémoire corticale (long-terme).

#[derive(Debug, Clone, PartialEq)]
pub struct TimeCell {
    /// L'information sensorielle ou l'événement brut (ex: vue du log, appel outil).
    pub event_payload: String,
    /// Timestamp relatif permettant le Séquençage du Déclenchement (Sequential Bursting).
    pub burst_timestamp_ms: u64,
}

/// Séquence temporelle fragile maintenue par l'hippocampe.
#[derive(Debug, Clone, PartialEq)]
pub struct EpisodicSequence {
    pub sequence: Vec<TimeCell>,
}

impl EpisodicSequence {
    pub fn new() -> Self {
        Self {
            sequence: Vec::new(),
        }
    }

    /// Binding : Couple un nouvel événement dans l'ordre chronologique.
    pub fn bind_event(&mut self, payload: &str, timestamp_ms: u64) {
        self.sequence.push(TimeCell {
            event_payload: payload.to_string(),
            burst_timestamp_ms: timestamp_ms,
        });
        // S'assure que la séquence est toujours triée chronologiquement
        self.sequence.sort_by_key(|cell| cell.burst_timestamp_ms);
    }
}

/// Représente le transfert de la mémoire Fragile (Hippocampe) vers Stable (Cortex).
#[derive(Debug, Clone)]
pub struct HippocampalReplay {
    pub agent_id: String,
    /// Le ratio de vitesse du replay (souvent 10x à 20x plus rapide que le temps réel).
    pub replay_speed_multiplier: f64,
}

impl HippocampalReplay {
    pub fn new(agent_id: String) -> Self {
        Self {
            agent_id,
            replay_speed_multiplier: 10.0,
        }
    }

    /// Évalue une séquence épisodique fragile. Si elle est jugée pertinente (score élevé),
    /// l'hippocampe la rejoue pour créer une règle/macro robuste dans le cortex.
    pub fn consolidate_memory(
        &self,
        episode: &EpisodicSequence,
        success_score: f64,
    ) -> Result<String, String> {
        if episode.sequence.is_empty() {
            return Err("Séquence épisodique vide.".to_string());
        }

        if success_score > 0.8 {
            // Phase Stable (Cortex) : Consolidation de A -> B -> C
            let mut cortical_macro = String::new();
            for (i, cell) in episode.sequence.iter().enumerate() {
                if i > 0 {
                    let delay = cell.burst_timestamp_ms - episode.sequence[i - 1].burst_timestamp_ms;
                    cortical_macro.push_str(&format!("-[{}ms]-> ", delay));
                }
                cortical_macro.push_str(&cell.event_payload);
            }

            Ok(format!(
                "Mémoire corticale stabilisée ({} étapes) : {}",
                episode.sequence.len(),
                cortical_macro
            ))
        } else {
            Ok("Score insuffisant. La trace hippocampique fragile s'estompe.".to_string())
        }
    }
}
