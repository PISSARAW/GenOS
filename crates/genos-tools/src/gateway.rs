use crate::{ToolExecutor, ToolInvocation, ToolResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// Résultat d'exécution sécurisé incluant le marqueur de Taint Tracking.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SecureToolOutput {
    /// Statut de succès ou d'échec de l'outil.
    pub success: bool,
    /// Contenu brut de la réponse de l'outil.
    pub output: serde_json::Value,
    /// Indicateur de Taint Tracking (true = potentiellement dangereux).
    pub is_tainted: bool,
}

impl SecureToolOutput {
    /// Crée un `SecureToolOutput` à partir d'un `ToolResult`.
    /// Par sécurité (Zero Trust), la sortie est marquée comme tainted par défaut.
    pub fn from_result(res: ToolResult) -> Self {
        Self {
            success: res.success,
            output: res.output,
            is_tainted: true,
        }
    }
}

/// Interface pour la validation des appels d'outils (Zero Trust / Policy Plane).
pub trait PolicyPlane: Send + Sync {
    /// Valide l'appel selon la politique de sécurité (2 paramètres max).
    fn validate(&self, call: &ToolInvocation) -> Result<(), String>;
}

/// État de l'automate Half-Open (Circuit Breaker) pour gérer les pannes.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum CircuitState {
    /// Le circuit est fermé : les appels sont exécutés normalement.
    Closed,
    /// Le circuit est ouvert : appels bloqués jusqu'à expiration du délai.
    Open { opened_at: u64 },
    /// Le circuit est semi-ouvert : test de guérison avec un appel.
    HalfOpen,
}

/// Automate Half-Open (Circuit Breaker) intégré à la Gateway.
pub struct CircuitBreaker {
    pub state: CircuitState,
    pub failures: usize,
    pub threshold: usize,
    pub cooldown_ms: u64,
}

impl CircuitBreaker {
    /// Instancie un nouveau CircuitBreaker avec des seuils spécifiques.
    pub fn new(threshold: usize, cooldown_ms: u64) -> Self {
        Self {
            state: CircuitState::Closed,
            failures: 0,
            threshold,
            cooldown_ms,
        }
    }

    fn now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    /// Vérifie si le circuit autorise l'exécution.
    pub fn check(&mut self) -> Result<(), String> {
        let now = Self::now();
        match self.state {
            CircuitState::Closed | CircuitState::HalfOpen => Ok(()),
            CircuitState::Open { opened_at } => {
                if now - opened_at >= self.cooldown_ms {
                    self.state = CircuitState::HalfOpen;
                    Ok(())
                } else {
                    Err("Circuit ouvert: outil en panne".to_string())
                }
            }
        }
    }

    /// Enregistre le résultat de l'exécution pour mettre à jour l'automate.
    pub fn record_result(&mut self, success: bool) {
        if success {
            self.failures = 0;
            self.state = CircuitState::Closed;
        } else {
            self.failures += 1;
            if self.failures >= self.threshold || self.state == CircuitState::HalfOpen {
                self.state = CircuitState::Open {
                    opened_at: Self::now(),
                };
            }
        }
    }
}

/// Passerelle d'interception (Tool Gateway) avec Policy Plane et Circuit Breaker.
pub struct ToolGateway<T: ToolExecutor, P: PolicyPlane> {
    pub executor: Arc<T>,
    pub policy: Arc<P>,
    pub circuit: Mutex<CircuitBreaker>,
}

impl<T: ToolExecutor, P: PolicyPlane> ToolGateway<T, P> {
    /// Crée une nouvelle ToolGateway sécurisée avec un circuit breaker par défaut.
    pub fn new(executor: Arc<T>, policy: Arc<P>) -> Self {
        Self {
            executor,
            policy,
            circuit: Mutex::new(CircuitBreaker::new(3, 5000)),
        }
    }

    /// Exécute un appel intercepté après validation et contrôle d'état (Half-Open).
    pub async fn execute_intercepted(
        &self,
        call: ToolInvocation,
    ) -> anyhow::Result<SecureToolOutput> {
        self.policy
            .validate(&call)
            .map_err(|e| anyhow::anyhow!(e))?;

        {
            let mut cb = self.circuit.lock().unwrap();
            cb.check().map_err(|e| anyhow::anyhow!(e))?;
        }

        let result = self.executor.execute(call).await;

        let mut cb = self.circuit.lock().unwrap();
        match result {
            Ok(res) => {
                cb.record_result(res.success);
                Ok(SecureToolOutput::from_result(res))
            }
            Err(e) => {
                cb.record_result(false);
                Err(e)
            }
        }
    }
}
