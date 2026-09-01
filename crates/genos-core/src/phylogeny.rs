use crate::genome::Genome;

/// Représente un des 3 grands Royaumes (Domaines) du vivant.
#[derive(Clone, Debug, PartialEq)]
pub enum Domain {
    Bacteria,   // Unicellulaire sans noyau (très simple)
    Archaea,    // Unicellulaire sans noyau (extrêmophiles)
    Eukaryota,  // Avec noyau (Plantes, Champignons, Animaux)
}

/// Clade spécifique pour Eukaryota pour illustrer la proximité Animaux-Champignons
#[derive(Clone, Debug, PartialEq)]
pub enum EukaryoteClade {
    Plants,
    Fungi,
    Animals,
}

/// Un nœud dans l'arbre phylogénétique.
/// Peut être une Feuille (Espèce actuelle) ou un Nœud Ancestral.
#[derive(Clone, Debug)]
pub enum PhylogeneticNode {
    /// Une feuille de l'arbre (une espèce aujourd'hui)
    /// Règle d'or : aucune feuille n'est supérieure à une autre.
    Leaf {
        name: String,
        domain: Domain,
        clade: Option<EukaryoteClade>,
        genome: Genome,
    },
    /// Un Ancêtre Commun (Le moment où deux branches se sont séparées)
    CommonNode {
        name: String,
        age_millions_years: f64,
        left: Box<PhylogeneticNode>,
        right: Box<PhylogeneticNode>,
    }
}

pub struct PhylogeneticTree {
    /// La racine (Le tronc), typiquement LUCA (Last Universal Common Ancestor)
    pub root: PhylogeneticNode, 
}

impl PhylogeneticTree {
    pub fn new(root: PhylogeneticNode) -> Self {
        Self { root }
    }

    /// L'horloge moléculaire : Compare l'ADN pour dater le nœud (l'ancêtre commun).
    /// Plus l'ADN se ressemble, plus la séparation est récente.

    /// Détermine si deux individus peuvent s'accoupler et avoir une descendance fertile
    /// C'est la définition stricte d'une espèce en biologie (Barrière reproductive).
    pub fn can_interbreed(genome_a: &Genome, genome_b: &Genome, geographic_isolation: bool) -> bool {
        // 1. Barrière physique (Spéciation Allopatrique en cours)
        // Ils ne peuvent pas se rencontrer !
        if geographic_isolation {
            return false;
        }

        // 2. Spéciation Sympatrique brutale (Polyploïdie)
        // Si l'un a un nombre de chromosomes différent (ex: une plante a doublé son ADN),
        // la descendance hybride serait asymétrique et donc stérile (comme la mule).
        if genome_a.extra_chromosomes.len() != genome_b.extra_chromosomes.len() {
            return false;
        }

        // 3. Divorce génétique par le temps (Dérive / Mutations accumulées)
        // Que la spéciation soit allopatrique (réunion après la disparition d'un canyon)
        // ou sympatrique (séparation des cycles sexuels), 
        // si la divergence est trop forte, les génomes sont incompatibles.
        let divergence_time = Self::estimate_divergence_time(genome_a, genome_b);
        
        // Seuil arbitraire de divergence pour notre simulation (ex: 15 millions d'années)
        if divergence_time > 15.0 {
            return false;
        }

        true
    }

    pub fn estimate_divergence_time(leaf1: &Genome, leaf2: &Genome) -> f64 {
        // Calcul simple de distance entre séquences de nucléotides
        let s1 = &leaf1.chromosome_maternal.sequence;
        let s2 = &leaf2.chromosome_maternal.sequence;
        
        let mut diffs = 0;
        let min_len = s1.len().min(s2.len());
        for i in 0..min_len {
            if s1[i] != s2[i] { diffs += 1; }
        }
        diffs += s1.len().max(s2.len()) - min_len;
        
        let max_len = s1.len().max(s2.len()) as f64;
        let divergence_ratio = (diffs as f64) / max_len.max(1.0);
        
        // Calibrage simulé (ex: 2% différence -> ~7 millions d'années pour Homme/Chimpanzé)
        divergence_ratio * 350.0
    }
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



