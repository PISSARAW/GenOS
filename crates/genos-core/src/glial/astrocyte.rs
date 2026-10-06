use serde::{Deserialize, Serialize};
use crate::cell::events::CellEvent;
use crate::cell::hippocampus::GraphMemory;
use crate::cell::substructs::Engram;

/// L'Astrocyte : L'architecte et protecteur du système nerveux (Cellule Gliale)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Astrocyte {
    pub glycogen_reserve: f64,
    pub is_reactive: bool,
    pub protected_neurons: Vec<String>,
}

impl Astrocyte {
    pub fn new(protected_neurons: Vec<String>) -> Self {
        Self {
            glycogen_reserve: 100.0,
            is_reactive: false,
            protected_neurons,
        }
    }

    /// Projection CQRS Asynchrone : L'Astrocyte écoute le flux d'événements (ActionTrace)
    /// et met à jour l'Hippocampe (Neo4J) et le Cortex (Vectoriel) de façon indépendante.
    pub async fn process_event_projection(
        &self,
        event: &CellEvent,
        hippocampus: Option<&GraphMemory>,
        cortex: &mut Vec<Engram>
    ) {
        match event {
            CellEvent::KnowledgeAcquired { concept, details } => {
                // 1. Projection Vectorielle (Cortex)
                cortex.push(Engram {
                    content: format!("{}: {}", concept, details),
                    vector: vec![], // Sera calculé en tâche de fond réelle
                    synaptic_weight: 1.0,
                });
                
                // 2. Projection Graphe (Hippocampe Neo4J)
                if let Some(graph) = hippocampus {
                    // On consolide la synapse sans bloquer l'agent (Fire-and-forget simulé)
                    let _ = graph.consolidate_synapse(concept, "CONTAINS_DETAILS", details).await;
                }
                
                println!("🌟 [Astrocyte CQRS] Événement KnowledgeAcquired projeté dans le Cortex et l'Hippocampe.");
            }
            CellEvent::TaskExecuted { task_name, result } => {
                // Enregistrement des tâches dans la base graphe pour traçabilité causale
                if let Some(graph) = hippocampus {
                    let _ = graph.consolidate_synapse(task_name, "PRODUCED_RESULT", result).await;
                }
                println!("🌟 [Astrocyte CQRS] Événement TaskExecuted consolidé dans l'Hippocampe.");
            }
            _ => {} // On ignore les événements purement immunitaires pour le RAG
        }
    }
}

fn neuron_alive_map(agents: &[crate::cell::AgentCell]) -> std::collections::HashMap<String, bool> {
    let mut map: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    for agent in agents.iter() {
        match agent.nervous_system() {
            None => {},
            Some(_) => {
                map.insert(agent.cell_id.to_string(), agent.metabolism.mitochondria.atp_budget > 0);
            }
        }
    }
    map
}

fn astro_has_emergency(protected: &[String], status: &std::collections::HashMap<String, bool>) -> bool {
    for n_id in protected {
        match status.get(n_id) {
            Some(false) => return true,
            _ => {},
        }
    }
    false
}

fn update_single_astro(agent: &mut crate::cell::AgentCell, status: &std::collections::HashMap<String, bool>) -> bool {
    match agent.astrocyte_mut() {
        None => false,
        Some(astro) => {
            match astro_has_emergency(&astro.protected_neurons.clone(), status) {
                true => astro.is_reactive = true,
                false => match astro.glycogen_reserve > 10.0 {
                    true => astro.glycogen_reserve -= 5.0,
                    false => {},
                },
            }
            true
        }
    }
}

fn collect_reactive_targets(agents: &[crate::cell::AgentCell]) -> Vec<String> {
    let mut out = Vec::new();
    for agent in agents.iter() {
        match agent.astrocyte() {
            None => {},
            Some(astro) => match astro.is_reactive {
                true => out.extend(astro.protected_neurons.clone()),
                false => {},
            },
        }
    }
    out
}

fn apply_astro_to_agent(agent: &mut crate::cell::AgentCell, reactive: &[String]) {
    match agent.nervous_system().is_some() {
        false => {},
        true => match reactive.contains(&agent.cell_id.to_string()) {
            true => match agent.nervous_system_mut() {
                Some(ns) => ns.axon.terminals.clear(),
                None => {},
            },
            false => {
                let budget = agent.metabolism.mitochondria.atp_budget;
                agent.metabolism.mitochondria.atp_budget = budget.saturating_add(20);
            }
        },
    }
}

pub fn process_astrocytes(agents: &mut [crate::cell::AgentCell], bhe_integrity: &mut f64) {
    let status = neuron_alive_map(agents);
    let mut bhe_intact = false;
    for agent in agents.iter_mut() {
        match update_single_astro(agent, &status) {
            true => bhe_intact = true,
            false => {},
        }
    }
    *bhe_integrity = match bhe_intact {
        true => 1.0,
        false => 0.0,
    };
    let reactive = collect_reactive_targets(agents);
    for agent in agents.iter_mut() {
        apply_astro_to_agent(agent, &reactive);
    }
}