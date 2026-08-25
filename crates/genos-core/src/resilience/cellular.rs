// Module de résilience cellulaire
// Implémente Apoptose, CODIT, Nociception et IDS/DLQ.

use std::sync::mpsc::{Receiver, Sender};
use std::thread;

/// Type d'erreur du système
#[derive(Debug, Clone)]
pub enum ErrorType {
    Recoverable,
    Critical,
    CorruptedData,
}

/// Dead Letter Queue (DLQ) / Intrusion Detection System (IDS)
pub struct DeadLetterQueue {
    failed_messages: Vec<String>,
}

impl Default for DeadLetterQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl DeadLetterQueue {
    pub fn new() -> Self {
        DeadLetterQueue {
            failed_messages: Vec::new(),
        }
    }

    pub fn push(&mut self, message: String) {
        println!("[DLQ] Message mis en quarantaine : {}", message);
        self.failed_messages.push(message);
    }

    pub fn count(&self) -> usize {
        self.failed_messages.len()
    }
}

/// CODIT: Compartmentalization of Decay in Trees
/// Isolation (Sandboxing) pour empêcher la propagation des erreurs
pub struct Sandbox {
    id: String,
}

impl Sandbox {
    pub fn new(id: String) -> Self {
        Sandbox { id }
    }

    /// Exécute une opération de façon isolée (max 2 paramètres).
    pub fn execute<F>(&self, operation: F) -> Result<(), ErrorType>
    where
        F: FnOnce() -> Result<(), ErrorType>,
    {
        println!("[CODIT] Exécution dans la sandbox : {}", self.id);
        operation()
    }
}

/// Nociception: Détection de la douleur/dommage et interruption d'urgence
pub struct Nociceptor {
    alert_tx: Sender<ErrorType>,
}

impl Nociceptor {
    pub fn new(alert_tx: Sender<ErrorType>) -> Self {
        Nociceptor { alert_tx }
    }

    /// Transmet un signal de douleur si l'erreur est critique.
    pub fn sense(&self, error: ErrorType) {
        if let ErrorType::Critical = error {
            println!("[Nociception] Signal d'urgence détecté !");
            let _ = self.alert_tx.send(error);
        }
    }
}

/// Apoptose: "Let it crash" - Mort cellulaire programmée
pub fn trigger_apoptosis(component: &str) {
    println!(
        "[Apoptose] Déclenchement de la destruction de : {}",
        component
    );
    // Simulation d'un crash intentionnel pour nettoyer l'état corrompu.
    // Dans un système réel, cela pourrait être un panic! ou une fin de thread.
    println!("[Apoptose] {} a été détruit proprement.", component);
}

/// Moniteur système orchestrant les algorithmes de résilience
pub struct ResilienceSystem {
    dlq: DeadLetterQueue,
    sandbox: Sandbox,
}

impl ResilienceSystem {
    pub fn new(sandbox_id: String) -> Self {
        ResilienceSystem {
            dlq: DeadLetterQueue::new(),
            sandbox: Sandbox::new(sandbox_id),
        }
    }

    /// Traite un message avec sandboxing et DLQ. (max 2 paramètres)
    pub fn process_message(&mut self, message: String) {
        let msg_clone = message.clone();

        let op = || -> Result<(), ErrorType> {
            if message.contains("corrupt") {
                Err(ErrorType::CorruptedData)
            } else if message.contains("critical") {
                Err(ErrorType::Critical)
            } else {
                Ok(())
            }
        };

        match self.sandbox.execute(op) {
            Ok(_) => println!("[Succès] Message traité : {}", msg_clone),
            Err(ErrorType::CorruptedData) => {
                self.dlq.push(msg_clone);
            }
            Err(e) => {
                println!("[Erreur] Échec non géré localement : {:?}", e);
            }
        }
    }

    /// Surveille les alertes critiques (Nociception) pour déclencher l'Apoptose.
    pub fn start_monitoring(rx: Receiver<ErrorType>) {
        thread::spawn(move || {
            if let Ok(ErrorType::Critical) = rx.recv() {
                trigger_apoptosis("WorkerNode");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn test_resilience_flow() {
        let (tx, rx) = mpsc::channel();
        let nociceptor = Nociceptor::new(tx);
        let mut system = ResilienceSystem::new("TestSandbox".to_string());

        ResilienceSystem::start_monitoring(rx);

        // Succès
        system.process_message("données valides".to_string());

        // DLQ (Sandboxing catch)
        system.process_message("corrupt payload".to_string());
        assert_eq!(system.dlq.count(), 1);

        // Nociception et Apoptose
        nociceptor.sense(ErrorType::Critical);
    }

    #[test]
    fn test_homeostatic_index() {
        let index = HomeostaticIndex::new(0.0, 0.0, 0.0);
        assert_eq!(index.compute_h_cell(), 1.0);
        assert_eq!(index.state(), HomeostaticState::Nominal);

        let degraded = HomeostaticIndex::new(0.5, 0.5, 0.5);
        assert_eq!(degraded.compute_h_cell(), 0.5);
        assert_eq!(degraded.state(), HomeostaticState::Degraded);

        let critical = HomeostaticIndex::new(0.9, 0.9, 0.9);
        assert!(critical.compute_h_cell() < 0.4);
        assert_eq!(critical.state(), HomeostaticState::Critical);
    }
}

/// Homéostasie: Index H_cell.
/// Calcule l'état global du système pour déclencher les mécanismes de résilience (throttling, hypermutation, apoptose).
#[derive(Debug, Clone, PartialEq)]
pub struct HomeostaticIndex {
    pub error_rate: f32, // E_rate
    pub latency: f32,    // latence
    pub semantic_drift: f32, // D_sem
}

#[derive(Debug, PartialEq, Clone)]
pub enum HomeostaticState {
    Nominal,
    Degraded,
    Critical,
}

impl HomeostaticIndex {
    pub fn new(error_rate: f32, latency: f32, semantic_drift: f32) -> Self {
        HomeostaticIndex { error_rate, latency, semantic_drift }
    }

    /// `H_cell = 1 - (0.40 * E_rate + 0.25 * latence + 0.35 * D_sem)`
    pub fn compute_h_cell(&self) -> f32 {
        let e_rate = self.error_rate.clamp(0.0, 1.0);
        let lat = self.latency.clamp(0.0, 1.0);
        let d_sem = self.semantic_drift.clamp(0.0, 1.0);
        let h = 1.0 - (0.40 * e_rate + 0.25 * lat + 0.35 * d_sem);
        h.clamp(0.0, 1.0)
    }

    /// Détermine l'état en fonction de l'index H_cell.
    pub fn state(&self) -> HomeostaticState {
        let h = self.compute_h_cell();
        if h >= 0.8 {
            HomeostaticState::Nominal
        } else if h >= 0.4 {
            HomeostaticState::Degraded
        } else {
            HomeostaticState::Critical
        }
    }
}
