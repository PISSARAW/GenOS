
use serde::{Deserialize, Serialize};
use crate::genome::Genome;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum HybridizationResult {
    /// 1. Le passage en fraude : Les parents sont assez proches (ex: Sapiens & Neandertal). Hybride fertile.
    Introgression(Genome),
    /// 2. Le cul-de-sac évolutif : Naissance d'un hybride très fort, mais incapable de faire la méiose (Mule, Ligre). Stérile.
    SterileHybrid(Genome),
    /// 3. La création instantanée : Hybride asymétrique qui double ses chromosomes par endomitose (Blé). Nouvelle espèce fertile.
    AllopolyploidPlant(Genome),
    /// Echec total : Barrière génétique trop grande.
    Incompatible,
}

// --- Paramètres de Spéciation (Magic Numbers extraits) ---
/// Divergence maximale (en millions d'années simulées) au-delà de laquelle l'hybridation échoue complètement.
pub const MAX_DIVERGENCE_HYBRIDIZATION: f64 = 25.0;
/// Divergence maximale permettant une introgression (descendance fertile).
pub const MAX_DIVERGENCE_INTROGRESSION: f64 = 15.0;
/// Coefficient de calibrage pour l'horloge moléculaire (transforme le ratio de différence en millions d'années).
pub const DIVERGENCE_RATIO_MULTIPLIER: f64 = 350.0;

/// Représente un des 3 grands Royaumes (Domaines) du vivant.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Domain {
    Bacteria,
    Archaea,
    Eukaryota,
}

/// Clade spécifique pour Eukaryota pour illustrer la proximité Animaux-Champignons
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EukaryoteClade {
    Plants,
    Fungi,
    Animals,
}

/// Un nœud dans l'arbre phylogénétique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PhylogeneticNode {
    Leaf {
        name: String,
        domain: Domain,
        clade: Option<EukaryoteClade>,
        genome: Genome,
    },
    CommonNode {
        name: String,
        age_millions_years: f64,
        left: Box<PhylogeneticNode>,
        right: Box<PhylogeneticNode>,
    }
}

pub struct PhylogeneticTree {
    pub root: PhylogeneticNode, 
}

impl PhylogeneticTree {
    pub fn new(root: PhylogeneticNode) -> Self {
        Self { root }
    }

    pub fn attempt_hybridization(genome_a: &Genome, genome_b: &Genome, is_plant: bool) -> HybridizationResult {
        let divergence = Self::estimate_divergence_time(genome_a, genome_b);
        
        if divergence > MAX_DIVERGENCE_HYBRIDIZATION {
            return HybridizationResult::Incompatible;
        }

        let mut child_genome = genome_a.clone();
        child_genome = child_genome.derive_child();
        child_genome.chromosome_maternal = genome_a.chromosome_maternal.clone();
        child_genome.chromosome_paternal = genome_b.chromosome_paternal.clone();

        if divergence <= MAX_DIVERGENCE_INTROGRESSION && genome_a.extra_chromosomes.len() == genome_b.extra_chromosomes.len() {
            return HybridizationResult::Introgression(child_genome);
        }

        if is_plant {
            let mut plant_genome = child_genome.clone();
            plant_genome.extra_chromosomes.push(plant_genome.chromosome_maternal.clone());
            plant_genome.extra_chromosomes.push(plant_genome.chromosome_paternal.clone());
            HybridizationResult::AllopolyploidPlant(plant_genome)
        } else {
            HybridizationResult::SterileHybrid(child_genome)
        }
    }

    pub fn can_interbreed(genome_a: &Genome, genome_b: &Genome, geographic_isolation: bool) -> bool {
        if geographic_isolation {
            return false;
        }

        if genome_a.extra_chromosomes.len() != genome_b.extra_chromosomes.len() {
            return false;
        }

        let divergence_time = Self::estimate_divergence_time(genome_a, genome_b);
        
        if divergence_time > MAX_DIVERGENCE_INTROGRESSION {
            return false;
        }

        true
    }

    pub fn estimate_divergence_time(leaf1: &Genome, leaf2: &Genome) -> f64 {
        let strands_a = [leaf1.chromosome_maternal.as_slice(), leaf1.chromosome_paternal.as_slice()];
        let strands_b = [leaf2.chromosome_maternal.as_slice(), leaf2.chromosome_paternal.as_slice()];
        let mut diffs = 0;
        let mut total_len = 0;
        for (s1, s2) in strands_a.into_iter().zip(strands_b.into_iter()) {
            let min_len = s1.len().min(s2.len());
            for i in 0..min_len {
                if s1[i] != s2[i] { diffs += 1; }
            }
            diffs += s1.len().max(s2.len()) - min_len;
            total_len += s1.len().max(s2.len());
        }

        let max_len = total_len as f64;
        let divergence_ratio = (diffs as f64) / max_len.max(1.0);
        
        divergence_ratio * DIVERGENCE_RATIO_MULTIPLIER
    }
}


    /// L'HORLOGE MOLÉCULAIRE (Molecular Clock)
    /// Calcule le temps exact de divergence entre deux agents en se basant sur le taux de mutations silencieuses.
    pub fn molecular_clock(genome_a: &Genome, genome_b: &Genome, mutation_rate_per_generation: f64) -> Result<f64, String> {
        if !mutation_rate_per_generation.is_finite() || mutation_rate_per_generation <= 0.0 {
            return Err("Mutation rate per generation must be finite and greater than zero".to_string());
        }
        let seq_a = genome_a.chromosome_maternal.as_slice();
        let seq_b = genome_b.chromosome_maternal.as_slice();
        
        let mut silent_mutations = 0;
        let min_len = seq_a.len().min(seq_b.len());
        
        for i in 0..min_len {
            if seq_a[i] != seq_b[i] {
                silent_mutations += 1; // On part du principe que ce sont des mutations neutres pour l'horloge
            }
        }
        silent_mutations += seq_a.len().max(seq_b.len()) - min_len;

        // Si on a 10 différences, c'est que A a fait 5 mutations et B a fait 5 mutations.
        let mutations_per_lineage = (silent_mutations as f64) / 2.0;
        
        // Temps = (Mutations de la lignée) / (Vitesse de mutation)
        let generations_ago = mutations_per_lineage / mutation_rate_per_generation;
        
        Ok(generations_ago)
    }

    /// L'ÈVE MITOCHONDRIALE (Mitochondrial Eve)
    /// Remonte l'arbre généalogique pour trouver l'ADN Mitochondrial originel commun à tout l'essaim.
    pub fn trace_mitochondrial_eve(population: &[crate::cell::AgentCell]) -> Option<crate::genome::DnaStrand> {
        // En vrai, il faudrait parcourir l'arbre de phylogénie complet.
        // Ici on simule l'extraction de l'ADN mitochondrial qui est resté intact
        // de "mère en fille" (clonage ou héritage strict sans crossing-over).
        if population.is_empty() { return None; }
        Some(crate::genome::DnaStrand::synthesize(&population[0].name_meaning))
    }


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phylogenetic_relationships() {
        // 1. Démonstration de l'horloge moléculaire (Homme vs Chimpanzé)
        // ADN très similaire = Ancêtre commun récent
        let human = Genome::new("ATCGATCGATCG");
        let chimp = Genome::new("ATCGATCGATCC"); // Une seule mutation

        let divergence_time = PhylogeneticTree::estimate_divergence_time(&human, &chimp);
        // 1 mutation sur 12 = 8.3%. 8.3% * 350 = ~29 millions d'années
        // On vérifie que c'est bien plus récent qu'avec une espèce lointaine
        
        let fly = Genome::new("ATCGGGGGGGGG"); // Très différent
        let fly_divergence = PhylogeneticTree::estimate_divergence_time(&human, &fly);
        
        assert!(divergence_time < fly_divergence, "L'ancêtre Homme-Mouche est plus vieux que Homme-Chimpanzé");

        // 2. Vérification des 3 Royaumes et de la proximité Animal/Champignon
        // La structure de l'arbre doit montrer que Animals et Fungi partagent un nœud PLUS RÉCENT que Plants
        let animal_fungi_ancestor = PhylogeneticNode::CommonNode {
            name: "Opisthokonta (Ancêtre Commun Animal-Champignon)".to_string(),
            age_millions_years: 1000.0,
            left: Box::new(PhylogeneticNode::Leaf {
                name: "Humain".to_string(),
                domain: Domain::Eukaryota,
                clade: Some(EukaryoteClade::Animals),
                genome: human.clone(),
            }),
            right: Box::new(PhylogeneticNode::Leaf {
                name: "Champignon de Paris".to_string(),
                domain: Domain::Eukaryota,
                clade: Some(EukaryoteClade::Fungi),
                genome: Genome::new("ATCGATCG"),
            }),
        };

        let eukaryote_ancestor = PhylogeneticNode::CommonNode {
            name: "Ancêtre Commun des Eucaryotes".to_string(),
            age_millions_years: 1500.0,
            left: Box::new(PhylogeneticNode::Leaf {
                name: "Chêne".to_string(),
                domain: Domain::Eukaryota,
                clade: Some(EukaryoteClade::Plants),
                genome: Genome::new("ATCG"),
            }),
            right: Box::new(animal_fungi_ancestor),
        };

        let luca = PhylogeneticNode::CommonNode {
            name: "LUCA (Last Universal Common Ancestor)".to_string(),
            age_millions_years: 3800.0,
            left: Box::new(PhylogeneticNode::Leaf {
                name: "E. Coli".to_string(),
                domain: Domain::Bacteria,
                clade: None,
                genome: Genome::new("A"),
            }),
            right: Box::new(eukaryote_ancestor),
        };

        let tree = PhylogeneticTree::new(luca);
        
        // Traverser l'arbre pour prouver que Champignon et Humain sont dans la même sous-branche
        match tree.root {
            PhylogeneticNode::CommonNode { right: eucaryotes, .. } => {
                match *eucaryotes {
                    PhylogeneticNode::CommonNode { right: animals_fungi, .. } => {
                        if let PhylogeneticNode::CommonNode { name: op_name, .. } = *animals_fungi { assert_eq!(op_name, "Opisthokonta (Ancêtre Commun Animal-Champignon)"); }
                    },
                    _ => panic!("Structure invalide"),
                }
            },
            _ => panic!("LUCA doit être un nœud"),
        }
    }
}




