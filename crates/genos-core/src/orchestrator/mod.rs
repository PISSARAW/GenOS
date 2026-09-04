pub mod therapies;
pub mod methods;
pub mod cart;
pub mod systems;
pub mod conscience;
pub mod vta;

pub use therapies::*;
pub use cart::*;
pub use systems::*;
pub use conscience::*;
pub use vta::*;

use crate::cell::AgentCell;
use crate::epigenetics::Expression;
use serde::{Deserialize, Serialize};

/// L'orchestrateur gère la boucle de vie de la cellule IA (l'Agent).
pub struct Orchestrator<
    I: ImmuneBehavior = StandardImmuneSystem,
    E: EndocrineBehavior = StandardEndocrineSystem,
    N: NervousBehavior = StandardNervousSystem
> {

    pub apoptosis_rule: Option<Expression>,
    pub immune_system: I,
    pub endocrine_system: E,
    pub nervous_system: N,
    pub viral_environment: Vec<crate::virology::Virion>,
    pub conscience: crate::orchestrator::conscience::Conscience,
    pub vta: crate::orchestrator::vta::VentralTegmentalArea,
}


