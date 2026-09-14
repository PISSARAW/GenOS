//! Environnement incarné : perception (`Percept`), action (`Action`), retour
//! (`Feedback`), et un bac à sable fichiers confiné (`FileSandbox`).
//!
//! Première brique du « vivant » : une boucle fermée où l'orchestrateur
//! **perçoit un monde externe, agit dessus, et reçoit une récompense externe**
//! (au lieu d'un état purement interne).

use crate::GenosEcosystem;
use crate::learning::context_from_state;
use crate::planner::Concept;
use serde_json::json;
use std::path::{Component, PathBuf};

/// Ce que l'agent perçoit de l'environnement.
#[derive(Clone, Debug, PartialEq)]
pub struct Percept {
    pub key: String,
    pub exists: bool,
    pub content: String,
    pub size: usize,
}

/// Action que l'agent exerce sur l'environnement.
#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    Read { path: String },
    Write { path: String, content: String },
    Append { path: String, content: String },
    Delete { path: String },
    List,
}

/// Retour d'une action, éventuellement accompagné d'un percept.
#[derive(Clone, Debug, PartialEq)]
pub struct Feedback {
    pub success: bool,
    pub message: String,
    pub percept: Option<Percept>,
}

/// Un monde externe dans lequel l'orchestrateur agit.
pub trait Environment {
    fn sense(&self, key: &str) -> Percept;
    fn act(&mut self, action: Action) -> Feedback;
}

/// Bac à sable fichiers confiné à un répertoire racine.
pub struct FileSandbox {
    pub root: PathBuf,
    pub ops: u64,
}

impl FileSandbox {
    pub fn new(root: impl Into<PathBuf>) -> std::io::Result<Self> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;
        Ok(Self { root, ops: 0 })
    }

    /// Résout un chemin relatif en interdisant toute remontée hors racine.
    fn resolve(&self, path: &str) -> Result<PathBuf, String> {
        let candidate = PathBuf::from(path);
        if candidate.is_absolute() {
            return Err("chemin absolu interdit".to_string());
        }
        if candidate
            .components()
            .any(|c| matches!(c, Component::ParentDir))
        {
            return Err("remontee interdite (..)".to_string());
        }
        Ok(self.root.join(candidate))
    }
}

impl Environment for FileSandbox {
    fn sense(&self, key: &str) -> Percept {
        if key.is_empty() || key == "." {
            let names: Vec<String> = std::fs::read_dir(&self.root)
                .map(|entries| {
                    entries
                        .flatten()
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect()
                })
                .unwrap_or_default();
            return Percept {
                key: key.to_string(),
                exists: true,
                content: names.join("\n"),
                size: names.len(),
            };
        }
        match self.resolve(key) {
            Ok(path) => match std::fs::read_to_string(&path) {
                Ok(content) => Percept {
                    key: key.to_string(),
                    exists: true,
                    size: content.len(),
                    content,
                },
                Err(_) => Percept {
                    key: key.to_string(),
                    exists: false,
                    content: String::new(),
                    size: 0,
                },
            },
            Err(message) => Percept {
                key: key.to_string(),
                exists: false,
                content: message,
                size: 0,
            },
        }
    }

    fn act(&mut self, action: Action) -> Feedback {
        self.ops += 1;
        let result = (|| -> Result<Option<Percept>, String> {
            match action {
                Action::Read { path } => {
                    let target = self.resolve(&path)?;
                    let content =
                        std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
                    Ok(Some(Percept {
                        key: path,
                        exists: true,
                        size: content.len(),
                        content,
                    }))
                }
                Action::Write { path, content } => {
                    let target = self.resolve(&path)?;
                    if let Some(parent) = target.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    std::fs::write(&target, content).map_err(|e| e.to_string())?;
                    Ok(None)
                }
                Action::Append { path, content } => {
                    let target = self.resolve(&path)?;
                    use std::io::Write;
                    let mut file = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&target)
                        .map_err(|e| e.to_string())?;
                    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
                    Ok(None)
                }
                Action::Delete { path } => {
                    let target = self.resolve(&path)?;
                    std::fs::remove_file(&target).map_err(|e| e.to_string())?;
                    Ok(None)
                }
                Action::List => Ok(Some(self.sense(""))),
            }
        })();
        match result {
            Ok(percept) => Feedback {
                success: true,
                message: "ok".to_string(),
                percept,
            },
            Err(message) => Feedback {
                success: false,
                message,
                percept: None,
            },
        }
    }
}

/// Bilan d'une tâche incarnée.
#[derive(Clone, Debug)]
pub struct EmbodiedReport {
    pub iterations: usize,
    pub actions: Vec<Action>,
    pub rewards: Vec<f64>,
    pub success: bool,
    pub reason: String,
}

impl GenosEcosystem {
    /// Boucle incarnée concrète : rendre `out_path` conforme à `spec_path`.
    ///
    /// Perçoit le monde, agit, reçoit une récompense **externe** (conformité de
    /// la sortie) et enregistre le tout pour l'apprentissage du directeur.
    pub fn embodied_task<E: Environment>(
        &mut self,
        env: &mut E,
        spec_path: &str,
        out_path: &str,
        max_iterations: usize,
    ) -> EmbodiedReport {
        let mut actions = Vec::new();
        let mut rewards = Vec::new();
        let mut iterations = 0;
        self.director
            .set_context(context_from_state(&self.observe()));

        for _ in 0..max_iterations {
            iterations += 1;
            let spec = env.sense(spec_path);
            if !spec.exists {
                self.director.record(Concept::Observe, false);
                return EmbodiedReport {
                    iterations,
                    actions,
                    rewards,
                    success: false,
                    reason: format!("spec introuvable: {spec_path}"),
                };
            }
            self.director.record(Concept::Observe, true);

            let current = env.sense(out_path);
            if current.exists && current.content == spec.content {
                self.director.record(Concept::Actuate, true);
                rewards.push(1.0);
                return EmbodiedReport {
                    iterations,
                    actions,
                    rewards,
                    success: true,
                    reason: "sortie conforme a la specification".to_string(),
                };
            }

            let action = Action::Write {
                path: out_path.to_string(),
                content: spec.content.clone(),
            };
            // Métabolisme réel : agir coûte de l'ATP.
            if !self.orchestrator.metabolism.consume(1.0) {
                return EmbodiedReport {
                    iterations,
                    actions,
                    rewards,
                    success: false,
                    reason: "famine : ATP insuffisant pour agir".to_string(),
                };
            }
            let feedback = env.act(action.clone());
            actions.push(action);
            let reward = if feedback.success { 1.0 } else { 0.0 };
            rewards.push(reward);
            self.director.record(Concept::Actuate, feedback.success);
            self.record_event(
                "EMBODIED_ACTION",
                json!({ "ok": feedback.success, "message": feedback.message }),
            );
        }

        EmbodiedReport {
            iterations,
            actions,
            rewards,
            success: false,
            reason: "iterations maximales atteintes".to_string(),
        }
    }
}
