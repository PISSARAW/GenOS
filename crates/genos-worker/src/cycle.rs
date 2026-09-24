//! Cycle universel partage par tous les workers.
//!
//! INCARNATE -> LOAD -> PERCEIVE -> ... -> ACT -> EVIDENCE ->
//! MEMOIRE -> COMMUNICATION -> CONTINUE / ADAPT / ESCALATE / TERMINATE.

use serde::{Deserialize, Serialize};

/// Etapes du cycle universel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CycleStep {
    Incarnate,
    LoadSelf,
    LoadMission,
    LoadAuthority,
    Perceive,
    UpdateEpistemics,
    RetrieveMemory,
    CheckRegulation,
    SelectRecipe,
    SelectStrategy,
    SelectProcedures,
    Act,
    CollectReceipts,
    AssessEvidence,
    UpdateMemory,
    Communicate,
    Review,
    Done,
}

impl CycleStep {
    /// Etape suivante nominale (sans decision).
    pub fn next(self) -> CycleStep {
        use CycleStep::*;
        match self {
            Incarnate => LoadSelf,
            LoadSelf => LoadMission,
            LoadMission => LoadAuthority,
            LoadAuthority => Perceive,
            Perceive => UpdateEpistemics,
            UpdateEpistemics => RetrieveMemory,
            RetrieveMemory => CheckRegulation,
            CheckRegulation => SelectRecipe,
            SelectRecipe => SelectStrategy,
            SelectStrategy => SelectProcedures,
            SelectProcedures => Act,
            Act => CollectReceipts,
            CollectReceipts => AssessEvidence,
            AssessEvidence => UpdateMemory,
            UpdateMemory => Communicate,
            Communicate => Review,
            Review => Done,
            Done => Done,
        }
    }
}

/// Decision de fin de cycle prise en Review.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ReviewDecision {
    pub success: bool,
    pub blocked: bool,
    pub need_adaptation: bool,
    pub need_capability: bool,
    pub need_parent: bool,
    pub unhealthy: bool,
}

/// Issue d'une revue de cycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CycleOutcome {
    Continue,
    Adapt,
    RequestCapability,
    Escalate,
    Terminate,
}

/// Etat runtime d'un worker en cours de cycle.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkerState {
    pub step: CycleStep,
    pub iteration: u32,
    pub max_iterations: u32,
    pub tokens_spent: u64,
    pub token_budget: u64,
    pub strategy_changes: u32,
    pub max_strategy_changes: u32,
    pub cognitive_changes: u32,
    pub max_cognitive_changes: u32,
    pub recipe_trajectory: Vec<String>,
    pub strategy_trajectory: Vec<String>,
    pub receipts: Vec<String>,
}

impl Default for WorkerState {
    fn default() -> Self {
        Self {
            step: CycleStep::Incarnate,
            iteration: 0,
            max_iterations: 10,
            tokens_spent: 0,
            token_budget: 8000,
            strategy_changes: 0,
            max_strategy_changes: 3,
            cognitive_changes: 0,
            max_cognitive_changes: 2,
            recipe_trajectory: Vec::new(),
            strategy_trajectory: Vec::new(),
            receipts: Vec::new(),
        }
    }
}

fn decide_outcome(decision: &ReviewDecision) -> CycleOutcome {
    if decision.success {
        return CycleOutcome::Terminate;
    }
    if decision.unhealthy || decision.need_parent {
        return CycleOutcome::Escalate;
    }
    if decision.blocked && !decision.need_adaptation {
        return CycleOutcome::Escalate;
    }
    if decision.need_capability {
        return CycleOutcome::RequestCapability;
    }
    if decision.need_adaptation {
        return CycleOutcome::Adapt;
    }
    CycleOutcome::Continue
}

fn budget_exhausted(state: &WorkerState) -> bool {
    state.tokens_spent >= state.token_budget
}

fn iterations_exhausted(state: &WorkerState) -> bool {
    state.iteration >= state.max_iterations
}

/// Evalue la revue de fin de cycle et fait avancer l'etat.
pub fn review(state: &mut WorkerState, decision: &ReviewDecision) -> CycleOutcome {
    if budget_exhausted(state) || iterations_exhausted(state) {
        state.step = CycleStep::Done;
        return CycleOutcome::Terminate;
    }
    let outcome = decide_outcome(decision);
    match outcome {
        CycleOutcome::Continue | CycleOutcome::Adapt => {
            state.iteration += 1;
            state.step = CycleStep::Perceive;
        }
        CycleOutcome::RequestCapability | CycleOutcome::Escalate => {
            state.step = CycleStep::Communicate;
        }
        CycleOutcome::Terminate => {
            state.step = CycleStep::Done;
        }
    }
    outcome
}

/// Avance d'une etape nominale (hors Review).
pub fn advance(state: &mut WorkerState) {
    state.step = state.step.next();
}

/// Enregistre un changement de strategie locale (borne).
pub fn record_strategy_change(state: &mut WorkerState, name: &str) -> bool {
    if state.strategy_changes >= state.max_strategy_changes {
        return false;
    }
    state.strategy_changes += 1;
    state.strategy_trajectory.push(name.to_string());
    true
}

/// Enregistre un changement de recette cognitive (borne).
pub fn record_cognitive_change(state: &mut WorkerState, name: &str) -> bool {
    if state.cognitive_changes >= state.max_cognitive_changes {
        return false;
    }
    state.cognitive_changes += 1;
    state.recipe_trajectory.push(name.to_string());
    true
}
