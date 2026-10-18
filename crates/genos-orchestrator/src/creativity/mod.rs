pub mod consolidation;
pub mod creativity_engine;
pub mod dopamine;
pub mod dreaming;
pub mod persistence;
pub mod salience;

pub use consolidation::{ConsolidationInput, CrossConsolidation, PolicyContext};
pub use creativity_engine::{CreativityConfig, CreativityEngine, CreativityMetrics};
pub use dopamine::{CreativityOutcome, DopamineSignal};
pub use dreaming::{DreamingPhase, RawHypothesis};
pub use persistence::PersistentCreativityEngine;
pub use salience::{FocusedTask, SalienceGate, SalienceWeights};
