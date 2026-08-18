use genos_core::{AgentGenome, GenomeId};
use genos_eval::phylogeny::PhylogenyTree;
use std::path::{Path, PathBuf};
use crate::snapshot::{LocalSnapshotStore, SnapshotStore};

/// Registre Fossile pour l'analyse cladistique et évolutive
pub struct FossilRegistry {
    store: LocalSnapshotStore,
}

impl FossilRegistry {
    pub fn new(store_path: impl Into<PathBuf>) -> Self {
        Self {
            store: LocalSnapshotStore::new(store_path),
        }
    }

    pub fn from_root(root: impl AsRef<Path>) -> Self {
        Self {
            store: LocalSnapshotStore::from_root(root),
        }
    }

    /// Récupère tous les génomes historiques connus dans le store
    pub async fn extract_all_genomes(&self) -> anyhow::Result<Vec<AgentGenome>> {
        let snapshot_ids = self.store.list_snapshot_ids().await?;
        let mut genomes = Vec::new();

        for id in snapshot_ids {
            if let Some(snapshot) = self.store.get_snapshot(id).await? {
                genomes.push(snapshot.genome);
            }
        }
        
        // Deduplicate genomes since multiple snapshots could have the same genome (if they are just different states of the same agent)
        let mut unique_genomes = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for g in genomes {
            if seen.insert(g.id.clone()) {
                unique_genomes.push(g);
            }
        }

        Ok(unique_genomes)
    }

    /// Reconstruit l'arbre phylogénétique complet (Cladogramme) au format Newick
    pub async fn build_global_phylogeny(&self) -> anyhow::Result<PhylogenyTree> {
        let genomes = self.extract_all_genomes().await?;
        Ok(PhylogenyTree::build_from_genomes(&genomes))
    }

    /// Remonte la lignée exacte d'un agent spécifique
    pub async fn extract_lineage(&self, target_genome_id: &GenomeId) -> anyhow::Result<Vec<AgentGenome>> {
        let genomes = self.extract_all_genomes().await?;
        let mut lineage = Vec::new();
        let mut current_id = target_genome_id.clone();

        while let Some(genome) = genomes.iter().find(|g| g.id == current_id) {
            lineage.push(genome.clone());
            // Remonte le premier parent pour une lignée simple (matrilinéaire / patrilinéaire)
            if !genome.parent_genomes.is_empty() {
                current_id = genome.parent_genomes[0].clone();
            } else if let Some(p) = &genome.parent_genome {
                current_id = p.clone();
            } else {
                break;
            }
        }

        lineage.reverse(); // De la racine jusqu'au target
        Ok(lineage)
    }
}
