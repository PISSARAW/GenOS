pub mod consolidation;
pub mod creativity_engine;
pub mod dopamine;
pub mod dreaming;
pub mod salience;

pub use creativity_engine::{CreativityEngine, CreativityConfig, CreativityMetrics};
pub use dreaming::{DreamingPhase, RawHypothesis};
pub use salience::{SalienceGate, FocusedTask};
pub use dopamine::{DopamineSignal, CreativityOutcome};
pub use consolidation::CrossConsolidation;
