use crate::{ToolExecutor, ToolInvocation, ToolResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{Mutex as AsyncMutex, OnceCell};

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
    probe_in_flight: bool,
}

impl CircuitBreaker {
    /// Instancie un nouveau CircuitBreaker avec des seuils spécifiques.
    pub fn new(threshold: usize, cooldown_ms: u64) -> Self {
        Self {
            state: CircuitState::Closed,
            failures: 0,
            threshold,
            cooldown_ms,
            probe_in_flight: false,
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
            CircuitState::Closed => Ok(()),
            CircuitState::HalfOpen => {
                if self.probe_in_flight {
                    Err("Circuit semi-ouvert: un appel canari est déjà en cours".to_string())
                } else {
                    self.probe_in_flight = true;
                    Ok(())
                }
            }
            CircuitState::Open { opened_at } => {
                if now.saturating_sub(opened_at) >= self.cooldown_ms {
                    self.state = CircuitState::HalfOpen;
                    self.probe_in_flight = true;
                    Ok(())
                } else {
                    Err("Circuit ouvert: outil en panne".to_string())
                }
            }
        }
    }

    /// Enregistre le résultat de l'exécution pour mettre à jour l'automate.
    pub fn record_result(&mut self, success: bool) {
        self.probe_in_flight = false;
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
    idempotency: AsyncMutex<HashMap<String, Arc<OnceCell<Result<SecureToolOutput, String>>>>>,
    idempotency_capacity: usize,
}

impl<T: ToolExecutor, P: PolicyPlane> ToolGateway<T, P> {
    /// Crée une nouvelle ToolGateway sécurisée avec un circuit breaker par défaut.
    pub fn new(executor: Arc<T>, policy: Arc<P>) -> Self {
        Self {
            executor,
            policy,
            circuit: Mutex::new(CircuitBreaker::new(3, 5000)),
            idempotency: AsyncMutex::new(HashMap::new()),
            idempotency_capacity: 1024,
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

    /// Executes an idempotent call at most once for a caller-provided key.
    pub async fn execute_idempotent(
        &self,
        key: impl Into<String>,
        call: ToolInvocation,
    ) -> anyhow::Result<SecureToolOutput> {
        let namespaced_key = format!("{}\0{}", call.name, key.into());
        let cell = {
            let mut entries = self.idempotency.lock().await;
            if !entries.contains_key(&namespaced_key) && entries.len() >= self.idempotency_capacity
            {
                if let Some(oldest) = entries.keys().next().cloned() {
                    entries.remove(&oldest);
                }
            }
            Arc::clone(
                entries
                    .entry(namespaced_key)
                    .or_insert_with(|| Arc::new(OnceCell::new())),
            )
        };
        match cell
            .get_or_init(|| async {
                self.execute_intercepted(call)
                    .await
                    .map_err(|error| error.to_string())
            })
            .await
        {
            Ok(output) => Ok(output.clone()),
            Err(error) => Err(anyhow::anyhow!(error.clone())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::time::{sleep, Duration};

    struct Allow;
    impl PolicyPlane for Allow {
        fn validate(&self, _: &ToolInvocation) -> Result<(), String> {
            Ok(())
        }
    }
    struct CountingExecutor(AtomicUsize);
    #[async_trait]
    impl ToolExecutor for CountingExecutor {
        async fn execute(&self, _: ToolInvocation) -> anyhow::Result<ToolResult> {
            self.0.fetch_add(1, Ordering::SeqCst);
            sleep(Duration::from_millis(10)).await;
            Ok(ToolResult {
                success: true,
                output: json!({"ok": true}),
            })
        }
    }

    #[tokio::test]
    async fn concurrent_idempotent_calls_execute_once_and_keys_are_tool_scoped() {
        let executor = Arc::new(CountingExecutor(AtomicUsize::new(0)));
        let gateway = Arc::new(ToolGateway::new(executor.clone(), Arc::new(Allow)));
        let call = ToolInvocation {
            name: "inspect".into(),
            input: json!({}),
        };
        let (left, right) = tokio::join!(
            gateway.execute_idempotent("same", call.clone()),
            gateway.execute_idempotent("same", call)
        );
        assert!(left.is_ok() && right.is_ok());
        assert_eq!(executor.0.load(Ordering::SeqCst), 1);
        gateway
            .execute_idempotent(
                "same",
                ToolInvocation {
                    name: "other".into(),
                    input: json!({}),
                },
            )
            .await
            .unwrap();
        assert_eq!(executor.0.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn half_open_admits_only_one_probe() {
        let mut breaker = CircuitBreaker::new(1, 0);
        breaker.record_result(false);
        assert!(breaker.check().is_ok());
        assert!(breaker.check().is_err());
        breaker.record_result(true);
        assert_eq!(breaker.state, CircuitState::Closed);
    }
}
