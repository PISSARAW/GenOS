use crate::cell::AgentCell;
use crate::cell::events::CellEvent;

/// Le Sommeil (Consolidation par Rejeu Déterministe)
/// Inspiré du replay hippocampique nocturne : l'agent "rejoue" ses propres traces 
/// pour transformer ses expériences éphémères en compétences génériques à long terme.
pub struct SleepConsolidation;

impl SleepConsolidation {
    /// Effectue un Rejeu Déterministe sur la trace d'un Agent gagnant (Mitose Inversée).
    /// Analyse la séquence des actions pour extraire des règles ou ajuster le génome.
    pub fn replay_experience(agent: &mut AgentCell) {
        let cell_id = agent.cell_id.to_string();
        if let Some(mind) = agent.mind_mut() {
            println!("💤 [Sommeil Paradoxal] Rejeu déterministe de la trace de l'Agent {}...", cell_id);
            
            let mut failures = 0;
            let mut successes = 0;
            let mut lessons_learned = Vec::new();

            // L'agent revit ses événements en accéléré (Fast-forward)
            for event in &mind.trace.sequence {
                match event {
                    CellEvent::TaskExecuted { task_name, result } => {
                        if result.contains("ERROR") || result.contains("FAIL") {
                            failures += 1;
                        } else if result.contains("SUCCESS") {
                            successes += 1;
                            // Synthétise une règle à partir de l'action réussie
                            let lesson = format!("RÈGLE APPRISE: '{}' mène au succès.", task_name);
                            lessons_learned.push(lesson);
                        }
                    }
                    _ => {}
                }
            }

            // Si l'agent a fait beaucoup d'erreurs avant de réussir, 
            // il "comprend" que son génome initial était mal réglé.
            if failures > successes && successes > 0 {
                println!("🧠 [Plasticité Synaptique] Apprentissage par renforcement : L'agent a extrait une routine après {} échecs.", failures);
            }

            // Consolidation dans le Cortex (Mémoire sémantique à long terme)
            for lesson in lessons_learned {
                mind.cognitive_state.semantic_memory.push(lesson.clone());
                println!("📖 Inscription Epigénétique : {}", lesson);
            }

            // Nettoyage de la trace de travail (Plaques amyloïdes évitées)
            // L'agent se réveille "frais", son historique de brouillon est vidé 
            // mais les règles extraites sont désormais dans sa mémoire à long terme.
            mind.trace.sequence.clear();
            println!("☀️ [Éveil] L'Agent {} est prêt pour un nouveau cycle de pensée.", cell_id);
        }
    }
}
