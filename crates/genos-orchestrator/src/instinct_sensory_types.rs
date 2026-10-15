use genos_biology::instinct::SignStimulus;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SensorySourceRef {
    pub event_id: String,
    pub source_digest: String,
}

#[derive(Clone, Debug)]
pub struct VerifiedSensoryStimulus {
    pub source_ref: SensorySourceRef,
    pub stimulus: SignStimulus,
}
