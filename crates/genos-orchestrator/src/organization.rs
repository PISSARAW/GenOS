//! Catalogue des organisations de GenOS et des formes supérieures
//! (holobionte, syncytium, métapopulation, rhizome, biocénose, biome, essaim),
//! choisis par le directeur selon l'état du monde.
//!
//! Les 19 organisations reproduisent `backend/src/services/dynamicOrganizationService.js`.

use crate::planner::{Goal, WorldState};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Topology {
    HubAndSpoke,
    IsolatedCritics,
    AdversarialTriangle,
    WeightedQuorum,
    Quorum,
    SharedEnvironment,
    DynamicNeighbors,
    WeightedBarycenter,
    AdaptiveMesh,
    AlphaBetaDelta,
    CapabilityMesh,
    RoleGradient,
    ResourceHuddle,
    Isolated,
    IsolatedCompetitors,
    Hierarchy,
    SharedMemory,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Exchange {
    Indirect,
    Active,
    Implicit,
    Buffered,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Visibility {
    Attributed,
    Anonymous,
    Sealed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Routing {
    Orchestrator,
    Broadcast,
    AdversarialPair,
    SharedTrail,
    Capability,
    Ranked,
    CriticalOnly,
}

/// Une organisation : topologie de communication, mode d'échange,
/// visibilité et routage.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Organization {
    pub name: &'static str,
    pub topology: Topology,
    pub exchange: Exchange,
    pub visibility: Visibility,
    pub routing: Routing,
}

use Exchange::*;
use Routing::*;
use Topology::*;
use Visibility::*;

/// Les 19 organisations de GenOS.
pub const ORGANIZATIONS: [Organization; 19] = [
    Organization { name: "specialist_expert_committee", topology: HubAndSpoke, exchange: Indirect, visibility: Attributed, routing: Orchestrator },
    Organization { name: "blind_adversarial_review", topology: IsolatedCritics, exchange: Indirect, visibility: Anonymous, routing: Broadcast },
    Organization { name: "red_blue_coevolution", topology: AdversarialTriangle, exchange: Active, visibility: Attributed, routing: AdversarialPair },
    Organization { name: "brier_weighted_consensus", topology: WeightedQuorum, exchange: Active, visibility: Attributed, routing: Broadcast },
    Organization { name: "quorum_with_abstention", topology: Quorum, exchange: Active, visibility: Attributed, routing: Broadcast },
    Organization { name: "stigmergy", topology: SharedEnvironment, exchange: Implicit, visibility: Attributed, routing: SharedTrail },
    Organization { name: "flocking_boids", topology: DynamicNeighbors, exchange: Active, visibility: Attributed, routing: Broadcast },
    Organization { name: "fish_school_search", topology: WeightedBarycenter, exchange: Implicit, visibility: Attributed, routing: Broadcast },
    Organization { name: "slime_mould_network", topology: AdaptiveMesh, exchange: Implicit, visibility: Attributed, routing: Capability },
    Organization { name: "grey_wolf_optimizer", topology: AlphaBetaDelta, exchange: Indirect, visibility: Attributed, routing: Ranked },
    Organization { name: "mycelial_routing", topology: CapabilityMesh, exchange: Active, visibility: Attributed, routing: Capability },
    Organization { name: "dynamic_polyethism", topology: RoleGradient, exchange: Active, visibility: Attributed, routing: Capability },
    Organization { name: "energy_huddle", topology: ResourceHuddle, exchange: Active, visibility: Attributed, routing: Broadcast },
    Organization { name: "network_silence", topology: Isolated, exchange: Buffered, visibility: Attributed, routing: CriticalOnly },
    Organization { name: "strategy_arena", topology: IsolatedCompetitors, exchange: Indirect, visibility: Sealed, routing: Orchestrator },
    Organization { name: "hierarchical_merge", topology: Hierarchy, exchange: Indirect, visibility: Attributed, routing: Orchestrator },
    Organization { name: "competitive_arena", topology: IsolatedCompetitors, exchange: Indirect, visibility: Sealed, routing: Orchestrator },
    Organization { name: "isolated_recovery", topology: Isolated, exchange: Indirect, visibility: Sealed, routing: Orchestrator },
    Organization { name: "memory_compilation", topology: SharedMemory, exchange: Implicit, visibility: Attributed, routing: SharedTrail },
];

pub fn catalog() -> &'static [Organization; 19] {
    &ORGANIZATIONS
}

pub fn by_name(name: &str) -> Option<&'static Organization> {
    ORGANIZATIONS.iter().find(|org| org.name == name)
}

fn org(name: &str) -> &'static Organization {
    by_name(name).expect("organisation du catalogue")
}

/// Formes supérieures d'organisation biologique.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Superorganism {
    Holobionte,
    Syncytium,
    Metapopulation,
    Rhizome,
    Biocenose,
    Biome,
    Swarm,
}

impl Superorganism {
    pub fn all() -> [Superorganism; 7] {
        use Superorganism::*;
        [Holobionte, Syncytium, Metapopulation, Rhizome, Biocenose, Biome, Swarm]
    }

    pub fn name(self) -> &'static str {
        use Superorganism::*;
        match self {
            Holobionte => "holobionte",
            Syncytium => "syncytium",
            Metapopulation => "metapopulation",
            Rhizome => "rhizome",
            Biocenose => "biocenose",
            Biome => "biome",
            Swarm => "swarm",
        }
    }

    pub fn description(self) -> &'static str {
        use Superorganism::*;
        match self {
            Holobionte => "hote + symbiotes : capacites fusionnees pour un organisme composite",
            Syncytium => "cellules fusionnees a memoire partagee (zero-IPC)",
            Metapopulation => "plusieurs patchs isoles relies par migration/dispersion",
            Rhizome => "reseau decentralise sans centre, resilience par redondance",
            Biocenose => "communaute d'especes differentes cohabitant un milieu",
            Biome => "grand ecosysteme : environnement + populations + ressources",
            Swarm => "essaim coordonne par stigmergie, quorum et traces",
        }
    }

    /// Prérequis minimal en agents pour que la forme soit viable.
    pub fn required_workers(self) -> usize {
        use Superorganism::*;
        match self {
            Biome => 1,
            Holobionte | Syncytium | Swarm => 2,
            Metapopulation | Rhizome | Biocenose => 3,
        }
    }

    pub fn is_available(self, state: &WorldState) -> bool {
        state.workers >= self.required_workers()
    }

    /// Organisation par défaut associée à cette forme.
    pub fn default_organization(self) -> &'static Organization {
        use Superorganism::*;
        match self {
            Holobionte => org("mycelial_routing"),
            Syncytium => org("memory_compilation"),
            Metapopulation | Rhizome => org("slime_mould_network"),
            Biocenose => org("flocking_boids"),
            Biome => org("stigmergy"),
            Swarm => org("stigmergy"),
        }
    }
}

/// Le directeur choisit l'organisation la plus adaptée à l'état.
pub fn select_organization(state: &WorldState, goal: &Goal) -> &'static Organization {
    if state.adversary {
        return org("red_blue_coevolution");
    }
    if state.traitor {
        return org("strategy_arena");
    }
    if state.stress >= 0.75 {
        // Stress élevé : mise au silence, traitement critique uniquement.
        return org("network_silence");
    }
    if state.uncertain {
        return org("brier_weighted_consensus");
    }
    if state.diseased > 0 {
        return org("isolated_recovery");
    }
    if state.budget < 20.0 || state.budget_pressure >= 0.8 {
        return org("energy_huddle");
    }
    if state.workers >= 5 {
        return org("quorum_with_abstention");
    }
    if state.threat > 0.0 && !state.observed {
        return org("stigmergy");
    }
    match goal {
        Goal::RepairModule => org("hierarchical_merge"),
        Goal::RecoverAgent => org("memory_compilation"),
        Goal::SecurePerimeter => org("specialist_expert_committee"),
        Goal::Explore => org("stigmergy"),
        Goal::Conserve => org("energy_huddle"),
    }
}

/// Choisit la forme supérieure, avec repli sur les formes disponibles.
pub fn select_superorganism(state: &WorldState, goal: &Goal) -> Superorganism {
    use Superorganism::*;
    let preferred = if state.adversary {
        Rhizome
    } else if matches!(goal, Goal::RepairModule) {
        Syncytium
    } else if state.diseased > 0 {
        Holobionte
    } else if state.workers >= 5 {
        Metapopulation
    } else if state.uncertain {
        Biocenose
    } else if state.threat > 0.0 && !state.observed {
        Biome
    } else {
        Swarm
    };
    for candidate in [preferred, Biocenose, Biome, Swarm] {
        if candidate.is_available(state) {
            return candidate;
        }
    }
    Biome
}
