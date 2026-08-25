//! Cerebellar proceduralization mapped to skill compilation.
//!
//! Biological mechanism: a gesture first controlled deliberately by the
//! cortex becomes automatic in the cerebellum after enough successful,
//! consistent repetitions — freeing cortical resources and cutting cost per
//! execution. Consolidation happens offline (sleep). A proceduralized skill
//! is continuously monitored: degraded success rate triggers de-procedural-
//! ization back to the deliberative path. In GenOS terms: traces → gated
//! opéron-like SkillProgram, monitored, reversible.

/// Observed execution statistics for one task, extracted from causal replay.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ExecutionStats {
    pub successes: u32,
    pub failures: u32,
    /// Cheap dispersion proxy of the successful trajectories (e.g. normalized
    /// variance of durations or step counts). Low variance = stereotyped.
    pub variance_proxy: f64,
}

impl ExecutionStats {
    pub fn total(&self) -> u32 {
        self.successes + self.failures
    }

    pub fn success_rate(&self) -> f64 {
        if self.total() == 0 {
            0.0
        } else {
            self.successes as f64 / self.total() as f64
        }
    }
}

/// Gate a task must clear before the cortex is allowed to forget it.
#[derive(Debug, Clone, Copy)]
pub struct ReadinessRule {
    pub min_successes: u32,
    pub min_success_rate: f64,
    pub max_variance: f64,
}

impl Default for ReadinessRule {
    fn default() -> Self {
        ReadinessRule {
            min_successes: 20,
            min_success_rate: 0.95,
            max_variance: 0.10,
        }
    }
}

/// Verdict of readiness assessment.
#[derive(Debug, Clone, PartialEq)]
pub enum Readiness {
    Ready,
    NotReady { reason: String },
}

/// A compiled reflex: the procedural counterpart of a deliberative task.
#[derive(Debug, Clone, PartialEq)]
pub struct SkillProgram {
    pub name: String,
    pub version: u32,
    pub preconditions: Vec<String>,
    pub steps: Vec<String>,
    pub postconditions: Vec<String>,
}

/// Health verdict during continuous monitoring of an installed program.
#[derive(Debug, Clone, PartialEq)]
pub enum Health {
    Keep,
    Uninstall { reason: String },
}

pub const DEPROCEDURALIZATION_FAILURE_RATE: f64 = 0.15;

/// Assess whether a task may be compiled into a reflex.
pub fn assess(stats: &ExecutionStats, rule: &ReadinessRule) -> Readiness {
    if stats.total() < rule.min_successes {
        return Readiness::NotReady {
            reason: format!(
                "only {} executions recorded, {} required",
                stats.total(),
                rule.min_successes
            ),
        };
    }
    if stats.success_rate() < rule.min_success_rate {
        return Readiness::NotReady {
            reason: format!(
                "success rate {:.2} below required {:.2}",
                stats.success_rate(),
                rule.min_success_rate
            ),
        };
    }
    if stats.variance_proxy > rule.max_variance {
        return Readiness::NotReady {
            reason: format!(
                "variance proxy {:.2} above ceiling {:.2}: trajectory not stereotyped yet",
                stats.variance_proxy,
                rule.max_variance
            ),
        };
    }
    Readiness::Ready
}

/// Compile a deliberative task into a SkillProgram. Fails closed: a task that
/// is not Ready keeps its cortical implementation.
pub fn compile(
    name: &str,
    preconditions: Vec<String>,
    steps: Vec<String>,
    postconditions: Vec<String>,
    stats: &ExecutionStats,
    rule: &ReadinessRule,
) -> Result<SkillProgram, String> {
    if steps.is_empty() {
        return Err("cannot compile an empty step sequence".to_string());
    }
    match assess(stats, rule) {
        Readiness::Ready => Ok(SkillProgram {
            name: name.to_string(),
            version: 1,
            preconditions,
            steps,
            postconditions,
        }),
        Readiness::NotReady { reason } => Err(reason),
    }
}

/// Re-compilation bumps the version (skill refinement keeps history).
pub fn recompile(previous: &SkillProgram, steps: Vec<String>) -> Result<SkillProgram, String> {
    if steps.is_empty() {
        return Err("cannot compile an empty step sequence".to_string());
    }
    Ok(SkillProgram { version: previous.version + 1, steps, ..previous.clone() })
}

/// Continuous monitoring: a proceduralized skill whose observed failure rate
/// exceeds the threshold is uninstalled back to the deliberative path.
pub fn monitor(failure_rate: f64) -> Health {
    if failure_rate > DEPROCEDURALIZATION_FAILURE_RATE {
        Health::Uninstall {
            reason: format!(
                "failure rate {:.2} exceeds de-proceduralization threshold {:.2}",
                failure_rate, DEPROCEDURALIZATION_FAILURE_RATE
            ),
        }
    } else {
        Health::Keep
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insufficient_sample_is_not_ready() {
        let stats =
            ExecutionStats { successes: 19, failures: 0, variance_proxy: 0.01 };
        let verdict = assess(&stats, &ReadinessRule::default());
        assert!(matches!(verdict, Readiness::NotReady { .. }));
    }

    #[test]
    fn inconsistent_trajectory_is_not_ready_even_with_high_success() {
        let stats =
            ExecutionStats { successes: 30, failures: 1, variance_proxy: 0.4 };
        let verdict = assess(&stats, &ReadinessRule::default());
        assert!(matches!(verdict, Readiness::NotReady { .. }));
    }

    #[test]
    fn stereotyped_success_compiles_into_a_reflex() {
        let stats = ExecutionStats { successes: 30, failures: 1, variance_proxy: 0.05 };
        let program = compile(
            "release-pipeline",
            vec!["tests_green".into()],
            vec!["build".into(), "sign".into(), "deploy".into()],
            vec!["release_published".into()],
            &stats,
            &ReadinessRule::default(),
        )
        .unwrap();
        assert_eq!(program.version, 1);
        assert_eq!(program.steps.len(), 3);
    }

    #[test]
    fn recompilation_bumps_version_and_keeps_contract() {
        let stats = ExecutionStats { successes: 30, failures: 1, variance_proxy: 0.05 };
        let mut program = compile(
            "release-pipeline",
            vec!["tests_green".into()],
            vec!["build".into(), "deploy".into()],
            vec![],
            &stats,
            &ReadinessRule::default(),
        )
        .unwrap();
        program = recompile(&program, vec!["build".into(), "attest".into(), "deploy".into()])
            .unwrap();
        assert_eq!(program.version, 2);
        assert_eq!(program.preconditions, vec!["tests_green".to_string()]);
        assert!(recompile(&program, vec![]).is_err());
    }

    #[test]
    fn degraded_reflex_is_uninstalled_back_to_cortex() {
        assert_eq!(monitor(0.05), Health::Keep);
        let health = monitor(0.30);
        assert!(matches!(health, Health::Uninstall { .. }));
    }
}
