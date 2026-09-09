use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Myelinator {
    Oligodendrocyte {
        connected_axons: Vec<String>,
        is_damaged: bool,
    },
    SchwannCell {
        target_axon: String,
        is_damaged: bool,
        forming_regeneration_tube: bool,
    },
}
