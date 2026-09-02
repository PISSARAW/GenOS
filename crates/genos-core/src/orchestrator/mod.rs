pub mod therapies;
pub mod methods;
pub mod cart;
pub mod systems;

pub use therapies::*;
pub use cart::*;
pub use systems::*;

use crate::cell::AgentCell;
use crate::epigenetics::Expression;
use serde::{Deserialize, Serialize};

/// L'orchestrateur gère la boucle de vie de la cellule IA (l'Agent).
pub struct Orchestrator {
    pub apoptosis_rule: Option<Expression>,
    pub immune_system: ImmuneSystem,
    pub endocrine_system: EndocrineSystem,
    pub nervous_system: NervousSystem,
    pub viral_environment: Vec<crate::virology::Virion>,
}

