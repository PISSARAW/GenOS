use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;

/// La couleur du fluorophore définit le niveau de sévérité ou le domaine (Logs de télémétrie)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum FluorophoreColor {
    /// Vert (GFP - Green Fluorescent Protein) : Métabolisme sain, succès, activité normale (INFO)
    Green,
    /// Bleu (BFP - Blue Fluorescent Protein) : Communications, signaux, MCP (DEBUG)
    Blue,
    /// Jaune (YFP - Yellow Fluorescent Protein) : Alertes, stress environnemental (WARN)
    Yellow,
    /// Rouge (RFP - Red Fluorescent Protein) : Choc anaphylactique, apoptose, erreurs critiques (ERROR)
    Red,
}

/// Une trace télémétrique structurée, émise par la cellule
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FluorescentSignal {
    pub timestamp: String,
    pub cell_id: Uuid,
    pub color: FluorophoreColor,
    pub organelle: String,
    pub event_type: String,
    pub details: String,
}

/// Le "Microscope" est notre système de Logging / Observabilité centralisé.
pub struct BioluminescenceMicroscope;

impl BioluminescenceMicroscope {
    /// Émet un log structuré sous forme de JSON (facilement ingérable par un dashboard ELK/Datadog)
    pub fn emit_fluorescence(
        cell_id: Uuid,
        color: FluorophoreColor,
        organelle: &str,
        event_type: &str,
        details: &str,
    ) {
        let signal = FluorescentSignal {
            timestamp: Utc::now().to_rfc3339(),
            cell_id,
            color,
            organelle: organelle.to_string(),
            event_type: event_type.to_string(),
            details: details.to_string(),
        };

        // En biologie de synthèse, on éclaire la cellule avec un laser.
        // En ingénierie, on émet la trace en format JSON structuré vers stdout.
        if let Ok(json_trace) = serde_json::to_string(&signal) {
            println!("🔬 [FLUORESCENCE] {}", json_trace);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bioluminescence_emission() {
        let dummy_id = Uuid::new_v4();
        
        // Simule un agent qui crashe
        BioluminescenceMicroscope::emit_fluorescence(
            dummy_id,
            FluorophoreColor::Red,
            "Mitochondria",
            "ATP_DEPLETION",
            "La cellule n'a plus d'énergie et déclenche l'apoptose.",
        );

        // Simule une communication réussie
        BioluminescenceMicroscope::emit_fluorescence(
            dummy_id,
            FluorophoreColor::Blue,
            "Cilia",
            "MCP_TOOL_CALLED",
            "L'enzyme fetch_github_issue a été activée.",
        );
    }
}