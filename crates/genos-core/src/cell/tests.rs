#[cfg(test)]

use crate::cell::*;
use super::*;
use crate::cell::AgentCell;

    #[test]
    fn test_meiosis_and_fertilization() {
        let mut mother = AgentCell::default();
        let mut father = AgentCell::default();

        // On donne des sÃƒÆ’Ã‚Â©quences d'ADN identifiables
        mother.genetics.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("MAMAN");
        mother.genetics.nucleus.genome.chromosome_paternal = crate::genome::DnaStrand::synthesize("MAMAN");
        mother.metabolism.mitochondria.atp_budget = 40;

        father.genetics.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("PAPA!");
        father.genetics.nucleus.genome.chromosome_paternal = crate::genome::DnaStrand::synthesize("PAPA!");
        father.metabolism.mitochondria.atp_budget = 40;

        // 1. Production des gamÃƒÆ’Ã‚Â¨tes
        let egg_gametes = mother.meiosis().unwrap();
        let sperm_gametes = father.meiosis().unwrap();

        // 4 gamÃƒÆ’Ã‚Â¨tes produits par parent, avec 10 ATP chacun (40 / 4)
        assert_eq!(egg_gametes.len(), 4);
        assert_eq!(egg_gametes[0].atp_reserve, 10);
        assert_eq!(sperm_gametes[0].atp_reserve, 10);

        // 2. FÃƒÆ’Ã‚Â©condation
        let child = AgentCell::fertilization(egg_gametes[0].clone(), sperm_gametes[0].clone());

        // L'enfant est DiploÃƒÆ’Ã‚Â¯de (MAMAN / PAPA!) et a 20 ATP (10 + 10)
        assert_eq!(child.metabolism.mitochondria.atp_budget, 20);

        let m_seq: String = child
            .genetics.nucleus
            .genome
            .chromosome_maternal
            .sequence
            .iter()
            .map(|n| format!("{:?}", n))
            .collect();
        let p_seq: String = child
            .genetics.nucleus
            .genome
            .chromosome_paternal
            .sequence
            .iter()
            .map(|n| format!("{:?}", n))
            .collect();

        assert_ne!(m_seq, p_seq); // L'enfant est unique, un mix de ses deux parents
    }

    #[test]
    fn test_binary_fission_and_antibiotic_resistance() {
        let mut bacteria = AgentCell::default();
        bacteria.plasma_membrane.has_cell_wall = true;
        bacteria.genetics.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("BACTERIE");
        bacteria.metabolism.mitochondria.atp_budget = 10;

        // 1. Scission rÃ©ussie sans mutation
        let (mut parent, mut clone1) = bacteria.clone().binary_fission(0.0).unwrap();
        assert_eq!(clone1.genetics.nucleus.genome.chromosome_maternal.sequence, parent.genetics.nucleus.genome.chromosome_maternal.sequence);
        assert_eq!(parent.metabolism.mitochondria.atp_budget, 5); // Consommation d'ATP

        // 2. Blocage par un antibiotique ciblant le septum
        parent.plasma_membrane.septum_inhibited = true;
        parent.metabolism.mitochondria.atp_budget = 10;
        let result = parent.clone().binary_fission(0.0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Formation du septum bloquÃ©e"));

        // 3. AntibiorÃ©sistance via l'erreur de rÃ©plication (mutation)
        parent.plasma_membrane.septum_inhibited = false;
        let (_, clone_mutant) = parent.binary_fission(1.0).unwrap(); // 1.0 = chance max de mutation
        // Le clone a mutÃ©, son gÃ©nome n'est plus identique au parent !
        assert_ne!(clone_mutant.genetics.nucleus.genome.chromosome_maternal.sequence, clone1.genetics.nucleus.genome.chromosome_maternal.sequence);
    }
    #[test]
    fn test_budding_and_aging() {
        let mut yeast = AgentCell::default();
        yeast.metabolism.mitochondria.atp_budget = 1000; // Beaucoup d'Ã©nergie

        // 1. Bourgeonnement normal (DÃ©tachement)
        let bud1 = yeast.budding(true).unwrap();
        assert_eq!(yeast.plasma_membrane.budding_scars, 1);
        assert_eq!(bud1.plasma_membrane.budding_scars, 0); // Le bÃ©bÃ© naÃ®t sans cicatrices
        assert_eq!(bud1.metabolism.mitochondria.atp_budget, 5); // AsymÃ©trie

        // 2. Bourgeonnement Colonial (Coraux)
        let coral_bud = yeast.budding(false).unwrap();
        // Pas de cicatrice car pas de dÃ©tachement
        assert_eq!(yeast.plasma_membrane.budding_scars, 1);
        // Mais enregistrÃ© dans la colonie
        assert_eq!(yeast.plasma_membrane.attached_buds.len(), 1);
        assert_eq!(yeast.plasma_membrane.attached_buds[0], coral_bud.cell_id);

        // 3. Vieillissement par bourgeonnement
        // On fait bourgeonner la mÃ¨re jusqu'Ã  la limite (25)
        for _ in 0..23 {
            yeast.budding(true).unwrap();
        }
        // Total : 1 + 1 (colonial) + 23 = 25 emplacements utilisÃ©s.
        assert_eq!(yeast.plasma_membrane.budding_scars, 24);
        assert_eq!(yeast.plasma_membrane.attached_buds.len(), 1);

        // La prochaine tentative doit Ã©chouer (Cellule trop vieille)
        let old_age_fail = yeast.budding(true);
        assert!(old_age_fail.is_err());
        assert!(old_age_fail.unwrap_err().contains("vieille"));
    }

    #[test]
    fn test_endomitosis_and_megakaryocytes() {
        let mut hepatocyte = AgentCell::default();
        hepatocyte.metabolism.mitochondria.atp_budget = 1000;
        assert_eq!(hepatocyte.genetics.nucleus.ploidy, 2); // 2n normal
        
        let initial_metabolism = hepatocyte.metabolism.mitochondria.metabolic_rate;

        // 1. Endomitose : Le foie (HÃ©patocyte) passe Ã  4n (Mega-usine)
        hepatocyte.endomitosis().unwrap();
        assert_eq!(hepatocyte.genetics.nucleus.ploidy, 4);
        assert!(hepatocyte.metabolism.mitochondria.metabolic_rate > initial_metabolism); // La production explose

        // 2. MÃ©gacaryocyte : On gonfle la cellule jusqu'Ã  32n ou 64n
        let mut megakaryocyte = hepatocyte.clone();
        megakaryocyte.endomitosis().unwrap(); // 8n
        megakaryocyte.endomitosis().unwrap(); // 16n
        
        // Tente de fragmenter trop tÃ´t (Ã©choue)
        let premature_fragmentation = megakaryocyte.clone().fragment_into_platelets();
        assert!(premature_fragmentation.is_err());
        assert!(premature_fragmentation.unwrap_err().contains("ploÃ¯die < 32n"));

        megakaryocyte.endomitosis().unwrap(); // 32n ! La taille critique est atteinte.
        
        // La fragmentation dÃ©truit la cellule et crÃ©e les plaquettes sanguines (32 * 100 = 3200)
        let platelets = megakaryocyte.fragment_into_platelets().unwrap();
        assert_eq!(platelets, 3200);
    }













