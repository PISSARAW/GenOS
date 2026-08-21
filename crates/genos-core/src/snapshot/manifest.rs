use serde::{Deserialize, Serialize};
use crate::ids::{AgentId, BranchId, SnapshotId};

/// Identifiant cryptographique unique (ex: SHA-256) pointant vers un blob de données dédupliqué en base.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CasHash(pub String);

/// Manifeste représentant l'état interne de l'agent.
///
/// Au lieu de stocker l'intégralité des mémoires de l'agent, cette structure
/// s'appuie sur des références hachées (`CasHash`) vers un stockage orienté contenu.
/// Cela permet un partage Copy-on-Write complet entre les sous-agents d'un même nœud.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentStateManifest {
    pub working_memory_hash: CasHash,
    pub semantic_memory_hash: CasHash,
    pub episodic_memory_hash: CasHash,
    pub beliefs_hash: CasHash,
}

/// Manifeste composant un `AgentSnapshot` de manière modulaire (Copy-on-Write).
///
/// Cette structure permet la création de milliers de mondes contrefactuels 
/// instantanément, car chaque composant lourd (génome, état, modèle SSM) 
/// est adressé par son hash SHA-256, rendant les duplications virtuellement gratuites (O(1)).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotComponentManifest {
    pub snapshot_id: SnapshotId,
    pub agent_id: AgentId,
    pub branch_id: BranchId,
    
    pub genome_hash: CasHash,
    pub state_hash: CasHash,
    pub ssm_state_hash: Option<CasHash>, 
}
