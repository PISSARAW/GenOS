use crate::cell::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;



#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ActionTrace {
    pub sequence: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct CognitiveState {
    pub epigenetic_drives: HashMap<String, f64>,
    pub working_memory: Vec<String>,
    pub episodic_memory: Vec<String>,
    pub semantic_memory: Vec<String>,
    /// 2. ImmunothÃƒÆ’Ã‚Â©rapie : Les cellules cancÃƒÆ’Ã‚Â©reuses activent ceci pour se cacher
    pub is_camouflaged: bool,
}

