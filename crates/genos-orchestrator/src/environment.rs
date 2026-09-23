//! Environnement incarné : perception (`Percept`), action (`Action`), retour
//! (`Feedback`), et un bac à sable fichiers confiné (`FileSandbox`).
//!
//! Première brique du « vivant » : une boucle fermée où l'orchestrateur
//! **perçoit un monde externe, agit dessus, et reçoit une récompense externe**
//! (au lieu d'un état purement interne).

use crate::learning::context_from_state;
use crate::planner::Concept;
use crate::GenosEcosystem;
use serde_json::json;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

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
    Read {
        path: String,
    },
    Write {
        path: String,
        content: String,
    },
    Append {
        path: String,
        content: String,
    },
    Delete {
        path: String,
    },
    List,
    Run {
        program: String,
        args: Vec<String>,
    },
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

    fn resolve(&self, path: &str) -> Result<PathBuf, String> {
        let candidate = PathBuf::from(path);
        if candidate.is_absolute() {
            return Err("chemin absolu interdit".to_string());
        }
        if candidate.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err("remontee interdite (..)".to_string());
        }
        Ok(self.root.join(candidate))
    }

    fn sense_directory(&self, key: &str) -> Percept {
        let names: Vec<String> = std::fs::read_dir(&self.root)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default();
        Percept {
            key: key.to_string(),
            exists: true,
            content: names.join("\n"),
            size: names.len(),
        }
    }

    fn sense_file(&self, key: &str) -> Percept {
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

    fn read_file(&self, path: &str) -> Result<Percept, String> {
        let target = self.resolve(path)?;
        let content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
        Ok(Percept {
            key: path.to_string(),
            exists: true,
            size: content.len(),
            content,
        })
    }

    fn write_file(&self, path: &str, content: &str) -> Result<(), String> {
        let target = self.resolve(path)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&target, content).map_err(|e| e.to_string())
    }

    fn append_file(&self, path: &str, content: &str) -> Result<(), String> {
        use std::io::Write;
        let target = self.resolve(path)?;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&target)
            .map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|e| e.to_string())
    }

    fn delete_file(&self, path: &str) -> Result<(), String> {
        let target = self.resolve(path)?;
        std::fs::remove_file(&target).map_err(|e| e.to_string())
    }
}

impl Environment for FileSandbox {
    fn sense(&self, key: &str) -> Percept {
        if key.is_empty() || key == "." {
            return self.sense_directory(key);
        }
        self.sense_file(key)
    }

    fn act(&mut self, action: Action) -> Feedback {
        self.ops += 1;
        let result = match action {
            Action::Read { path } => self.read_file(&path).map(Some),
            Action::Write { path, content } => {
                self.write_file(&path, &content).map(|_| None)
            }
            Action::Append { path, content } => {
                self.append_file(&path, &content).map(|_| None)
            }
            Action::Delete { path } => self.delete_file(&path).map(|_| None),
            Action::List => Ok(Some(self.sense(""))),
            Action::Run { .. } => Err("execution interdite dans FileSandbox".to_string()),
        };
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

/// Environnement système minimal : binaires allowlistés, sans shell, cwd confiné.
pub struct ProcessSandbox {
    pub root: PathBuf,
    pub allowed_programs: Vec<String>,
    pub ops: u64,
}

impl ProcessSandbox {
    pub fn new(root: impl Into<PathBuf>, allowed_programs: Vec<String>) -> std::io::Result<Self> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            allowed_programs,
            ops: 0,
        })
    }

    fn allowed(&self, program: &str) -> bool {
        let name = Path::new(program)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(program);
        program == name && self.allowed_programs.iter().any(|allowed| allowed == name)
    }
}

impl Environment for ProcessSandbox {
    fn sense(&self, key: &str) -> Percept {
        let path = self.root.join(key);
        match std::fs::read_to_string(&path) {
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
        }
    }

    fn act(&mut self, action: Action) -> Feedback {
        self.ops += 1;
        let Action::Run { program, args } = action else {
            return Feedback {
                success: false,
                message: "ProcessSandbox accepte uniquement Run".to_string(),
                percept: None,
            };
        };
        if !self.allowed(&program) {
            return Feedback {
                success: false,
                message: "binaire non autorise".to_string(),
                percept: None,
            };
        }
        match Command::new(&program)
            .args(args)
            .current_dir(&self.root)
            .output()
        {
            Ok(output) => {
                let content = String::from_utf8_lossy(&output.stdout).to_string();
                let error = String::from_utf8_lossy(&output.stderr);
                Feedback {
                    success: output.status.success(),
                    message: if error.is_empty() {
                        content.clone()
                    } else {
                        error.to_string()
                    },
                    percept: Some(Percept {
                        key: program,
                        exists: true,
                        size: content.len(),
                        content,
                    }),
                }
            }
            Err(error) => Feedback {
                success: false,
                message: error.to_string(),
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
