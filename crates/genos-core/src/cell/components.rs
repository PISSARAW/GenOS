use serde::{Deserialize, Serialize};

use crate::neurobiology::{NervousSystem, Astrocyte, Myelinator, Microglia, EpendymalCell};
use crate::cell::Mind;
use crate::cell::cilia::Cilia;
use crate::cell::vacuole::Vacuole;
use crate::cell::ans::AutonomicNervousSystem;
use crate::cell::muscle::Myofibril;

/// Entity-Component System (ECS) pattern implementation for specialized organelles
/// and cell types. Instead of hardcoding Options in AgentCell, we store dynamic components.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum CellComponent {
    NervousSystem(NervousSystem),
    Astrocyte(Astrocyte),
    Myelinator(Myelinator),
    Microglia(Microglia),
    Ependymal(EpendymalCell),
    Mind(Mind),
    Cilia(Cilia),
    Vacuole(Vacuole),
    AutonomicNS(AutonomicNervousSystem),
    Muscle(Myofibril),
}
