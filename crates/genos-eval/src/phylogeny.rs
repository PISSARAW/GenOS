use genos_core::{AgentGenome, GenomeId};
use std::collections::HashMap;

/// Calcule la distance gÃ©nÃ©tique Euclidienne (horloge molÃ©culaire) entre deux gÃ©nomes
pub fn molecular_clock_distance(a: &AgentGenome, b: &AgentGenome) -> f64 {
    let mut sum_sq = 0.0;
    for a_chrom in &a.cognition.chromosomes {
        if let Some(b_chrom) = b
            .cognition
            .chromosomes
            .iter()
            .find(|c| c.name == a_chrom.name)
        {
            for a_locus in &a_chrom.loci {
                if let Some(b_locus) = b_chrom
                    .loci
                    .iter()
                    .find(|l| l.gene_name == a_locus.gene_name)
                {
                    let diff = (a_locus.expressed_value() - b_locus.expressed_value()) as f64;
                    sum_sq += diff * diff;
                }
            }
        }
    }
    sum_sq.sqrt()
}

/// ReprÃ©sente un nÅ“ud (Clade ou Feuille) dans l'arbre phylogÃ©nÃ©tique.
#[derive(Debug, Clone)]
pub struct PhylogenyNode {
    /// Identifiant unique du gÃ©nome.
    pub id: GenomeId,
    /// Identifiants des gÃ©nomes parents (ascendance directe).
    pub parents: Vec<GenomeId>,
    /// Identifiants des gÃ©nomes enfants (descendance directe).
    pub children: Vec<GenomeId>,
    /// Distance gÃ©nÃ©tique cumulative depuis la racine de la lignÃ©e (Horloge MolÃ©culaire).
    pub distance_from_root: f64,
}

/// Structure en Graphe OrientÃ© Acyclique (DAG) retraÃ§ant l'Ã©volution et les relations familiales des agents.
#[derive(Debug)]
pub struct PhylogenyTree {
    /// Dictionnaire de tous les nÅ“uds de l'arbre, indexÃ©s par leur GenomeId.
    pub nodes: HashMap<GenomeId, PhylogenyNode>,
    /// Liste des ancÃªtres fondamentaux (nÅ“uds sans parents).
    pub roots: Vec<GenomeId>,
}

impl PhylogenyTree {
    /// Construit l'arbre phylogÃ©nÃ©tique Ã  partir d'une liste plate de gÃ©nomes.
    /// Les liens de parentÃ© et les distances de l'horloge molÃ©culaire sont automatiquement rÃ©solus.
    pub fn build_from_genomes(genomes: &[AgentGenome]) -> Self {
        let mut nodes = HashMap::new();
        let mut children_map: HashMap<GenomeId, Vec<GenomeId>> = HashMap::new();
        let mut roots = Vec::new();

        // Identifier les enfants
        for g in genomes {
            let mut parents = g.parent_genomes.clone();
            if let Some(p) = &g.parent_genome {
                if !parents.contains(p) {
                    parents.push(p.clone());
                }
            }

            if parents.is_empty() {
                roots.push(g.id.clone());
            }

            for p in &parents {
                children_map
                    .entry(p.clone())
                    .or_default()
                    .push(g.id.clone());
            }
        }

        // Construire les noeuds
        for g in genomes {
            let mut parents = g.parent_genomes.clone();
            if let Some(p) = &g.parent_genome {
                if !parents.contains(p) {
                    parents.push(p.clone());
                }
            }

            let children = children_map.get(&g.id).cloned().unwrap_or_default();

            // Molecular clock from parents (moyenne des distances)
            let mut distance_from_root = 0.0;
            if !parents.is_empty() {
                // Pour simplifier l'horloge molÃ©culaire dans cet exemple, on calcule par rapport au premier parent
                if let Some(p_genome) = genomes.iter().find(|x| x.id == parents[0]) {
                    distance_from_root = molecular_clock_distance(p_genome, g);
                }
            }

            nodes.insert(
                g.id.clone(),
                PhylogenyNode {
                    id: g.id.clone(),
                    parents,
                    children,
                    distance_from_root,
                },
            );
        }

        // Cumuler les distances depuis la racine pour l'horloge absolue
        let mut resolved_distances = HashMap::new();
        let mut queue = roots.clone();
        for r in &roots {
            resolved_distances.insert(r.clone(), 0.0);
        }

        while !queue.is_empty() {
            let current = queue.remove(0);
            if let Some(node) = nodes.get(&current) {
                let current_dist = *resolved_distances.get(&current).unwrap_or(&0.0);
                for child_id in &node.children {
                    if let Some(child_node) = nodes.get(child_id) {
                        let new_dist = current_dist + child_node.distance_from_root;
                        resolved_distances.insert(child_id.clone(), new_dist);
                        queue.push(child_id.clone());
                    }
                }
            }
        }

        for (id, dist) in resolved_distances {
            if let Some(node) = nodes.get_mut(&id) {
                node.distance_from_root = dist;
            }
        }

        Self { nodes, roots }
    }

    /// Exporte l'arbre au format texte standard Newick `((A,B),C);`
    pub fn to_newick(&self) -> String {
        let mut result = String::new();
        for root in &self.roots {
            result.push_str(&self.build_newick_for_node(root));
            result.push_str(";\n");
        }
        result
    }

    fn build_newick_for_node(&self, id: &GenomeId) -> String {
        if let Some(node) = self.nodes.get(id) {
            if node.children.is_empty() {
                // Feuille (Taxon)
                return format!("{}:{:.3}", id.0, node.distance_from_root);
            }

            // Clade (Noeud interne)
            let mut children_str = Vec::new();
            for child_id in &node.children {
                children_str.push(self.build_newick_for_node(child_id));
            }
            return format!(
                "({}){}:{:.3}",
                children_str.join(","),
                id.0,
                node.distance_from_root
            );
        }
        String::new()
    }
}
