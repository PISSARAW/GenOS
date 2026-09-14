//! Traces d'actions par agent, replay et diagnostic.
//!
//! Chaque action observée sur un agent est enregistrée ; un **replay** résume
//! ce qu'il a fait (succès, échecs, gaspillage, répétitions) et produit un
//! **verdict** : sain, à muter, à croiser, plasmide manquant, famine, à
//! supprimer, ou à soigner.

use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Success,
    Failure,
    Wasted,
}

#[derive(Clone, Debug)]
pub struct TraceEvent {
    pub tick: u64,
    pub action: String,
    pub outcome: Outcome,
}

#[derive(Clone, Debug, Default)]
pub struct AgentTrace {
    pub events: Vec<TraceEvent>,
}

impl AgentTrace {
    pub fn record(&mut self, tick: u64, action: &str, outcome: Outcome) {
        self.events.push(TraceEvent {
            tick,
            action: action.to_string(),
            outcome,
        });
    }

    /// Rejoue la trace et en dresse le bilan.
    pub fn replay(&self) -> ReplayReport {
        let mut report = ReplayReport::default();
        let mut run = 0usize;
        for event in &self.events {
            report.attempts += 1;
            match event.outcome {
                Outcome::Success => report.successes += 1,
                Outcome::Failure => {
                    report.failures += 1;
                    report.last_failure = Some(event.action.clone());
                }
                Outcome::Wasted => report.wasted += 1,
            }
            if report.previous.as_deref() == Some(event.action.as_str()) {
                run += 1;
            } else {
                run = 1;
            }
            report.repetition = report.repetition.max(run);
            report.previous = Some(event.action.clone());
        }
        report
    }
}

#[derive(Clone, Debug, Default)]
pub struct ReplayReport {
    pub attempts: usize,
    pub successes: usize,
    pub failures: usize,
    pub wasted: usize,
    /// Plus longue suite d'actions identiques consécutives.
    pub repetition: usize,
    pub last_failure: Option<String>,
    previous: Option<String>,
}

impl ReplayReport {
    pub fn success_rate(&self) -> f64 {
        if self.attempts == 0 {
            0.0
        } else {
            self.successes as f64 / self.attempts as f64
        }
    }
}

/// Destin décidé pour un agent à partir de sa trace.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Healthy,
    NeedsMutation,
    NeedsCrossover,
    NeedsPlasmid,
    Starve,
    Cull,
    Therapy,
}

impl Verdict {
    pub fn label(self) -> &'static str {
        match self {
            Verdict::Healthy => "sain",
            Verdict::NeedsMutation => "mutation",
            Verdict::NeedsCrossover => "croisement",
            Verdict::NeedsPlasmid => "plasmide",
            Verdict::Starve => "famine",
            Verdict::Cull => "suppression",
            Verdict::Therapy => "soin",
        }
    }
}

/// Décide le destin d'un agent à partir du replay.
pub fn diagnose(report: &ReplayReport) -> Verdict {
    if report.attempts == 0 {
        return Verdict::Healthy;
    }
    // Gaspillage majoritaire : famine (throttle).
    if report.wasted * 2 > report.attempts {
        return Verdict::Starve;
    }
    // Échecs répétés sans aucun succès : suppression.
    if report.successes == 0 && report.failures >= 3 {
        return Verdict::Cull;
    }
    // Échec signalant une compétence manquante : plasmide à fournir.
    if report
        .last_failure
        .as_deref()
        .map(|action| action.contains("skill"))
        .unwrap_or(false)
    {
        return Verdict::NeedsPlasmid;
    }
    // Boucles / majorité d'échecs : mutation.
    if report.repetition >= 3 || report.failures > report.successes {
        return Verdict::NeedsMutation;
    }
    // Succès partiels : croisement avec un agent complémentaire.
    if report.failures > 0 {
        return Verdict::NeedsCrossover;
    }
    Verdict::Healthy
}

/// Registre de traces, indexé par agent.
#[derive(Clone, Debug, Default)]
pub struct TraceStore {
    pub traces: HashMap<Uuid, AgentTrace>,
}

impl TraceStore {
    pub fn record(&mut self, agent: Uuid, tick: u64, action: &str, outcome: Outcome) {
        self.traces.entry(agent).or_default().record(tick, action, outcome);
    }

    pub fn replay(&self, agent: Uuid) -> ReplayReport {
        self.traces
            .get(&agent)
            .map(AgentTrace::replay)
            .unwrap_or_default()
    }

    pub fn diagnose(&self, agent: Uuid) -> Verdict {
        diagnose(&self.replay(agent))
    }

    pub fn known(&self) -> usize {
        self.traces.len()
    }
}
