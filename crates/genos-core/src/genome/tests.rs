#[cfg(test)]
mod tests {
    use crate::genome::*;
    use super::*;

    #[test]
    fn test_central_dogma_of_biology() {
        let gene = Gene::new("test", "GenOS V2 is alive!");
        let protein_output = gene.express(&[], None, &[]).unwrap();
        assert_eq!(protein_output, "GenOS V2 is alive!");
    }

    #[test]
    fn test_cellular_regulation_mechanisms() {
        let mut gene = Gene::new("MUSCLE", "CONTRACT_NOWRELAX_NOW!!!");
        gene.required_activator = Some("FIGHT".to_string());
        assert!(gene.express(&[], None, &[]).is_err());
        assert!(gene.express(&["FIGHT".to_string()], None, &[]).is_ok());

        let result = gene.express(&[], None, &["MUSCLE".to_string()]);
        assert!(result.is_err());
    }




    #[test]
    fn test_transcription_and_alternative_splicing() {
        // Le grand mystère de l'humanité: 20 000 gènes -> 100 000 protéines !
        // Créons un gène contenant 5 blocs de 3 lettres ("AAA", "BBB", "CCC", "DDD", "EEE").
        // En Base64, chaque bloc de 3 lettres (3 octets) devient 4 caractères.
        // Chaque caractère Base64 = 3 nucléotides. Donc un bloc = 12 nucléotides exacts !
        let gene = Gene::new("TEST", "AAABBBCCCDDDEEE");
        
        let pre_spliced = gene.express(&[], None, &[]).unwrap();
        assert_eq!(pre_spliced, "AAABBBCCCDDDEEE");
        
        // Splicing partiel (Alternative Splicing)
        // LIVER garde AAA (0..12), CCC (24..36) et EEE (48..60)
        let liver_exons = [(0, 12), (24, 36), (48, 60)]; 
        let liver_protein = gene.express(&[], Some(&liver_exons), &[]).unwrap();
        assert_eq!(liver_protein, "AAACCCEEE");
        
        // BRAIN garde AAA (0..12) et DDD (36..48)
        let brain_exons = [(0, 12), (36, 48)]; 
        let brain_protein = gene.express(&[], Some(&brain_exons), &[]).unwrap();
        assert_eq!(brain_protein, "AAADDD");
    }
    #[test]
    fn test_x_inactivation_calico_cat() {
        // Le chat femelle a 2 chromosomes X. On les simule comme deux gènes de couleur de poils.
        let mut x_paternal_orange = Gene::new("HAIR_COLOR", "ORANGE_HAIR_PIGMENT_1");
        let mut x_maternal_black = Gene::new("HAIR_COLOR", "BLACK_HAIR_PIGMENT_01");

        // 1. Avant désactivation, l'expression des 2 X causerait une surdose toxique (fictive ici, mais c'est le principe)
        assert!(x_paternal_orange.express(&[], None, &[]).is_ok());
        assert!(x_maternal_black.express(&[], None, &[]).is_ok());

        // 2. Différenciation cellulaire : Inactivation aléatoire en Hétérochromatine Facultative (Corpuscule de Barr)
        // Cellule de peau 1 : Désactive le X paternel (Roux)
        x_paternal_orange.chromatin_state = ChromatinState::HeterochromatinFacultative;
        
        let result_paternal = x_paternal_orange.express(&[], None, &[]);
        assert!(result_paternal.is_err());
        assert!(result_paternal.unwrap_err().contains("OFF: L'ADN est trop serre"));
        // Seul le noir s'exprime -> Tache noire
        assert_eq!(x_maternal_black.express(&[], None, &[]).unwrap(), "BLACK_HAIR_PIGMENT_01");

        // Cellule de peau 2 : Désactive le X maternel (Noir)
        let mut x_paternal_orange_cell2 = Gene::new("HAIR_COLOR", "ORANGE_HAIR_PIGMENT_1");
        let mut x_maternal_black_cell2 = Gene::new("HAIR_COLOR", "BLACK_HAIR_PIGMENT_01");
        x_maternal_black_cell2.chromatin_state = ChromatinState::HeterochromatinFacultative;

        let result_maternal = x_maternal_black_cell2.express(&[], None, &[]);
        assert!(result_maternal.is_err());
        // Seul le roux s'exprime -> Tache rousse
        assert_eq!(x_paternal_orange_cell2.express(&[], None, &[]).unwrap(), "ORANGE_HAIR_PIGMENT_1");
        
        // Hétérochromatine Constitutive : Test sur un Télomère
        let mut telomere = Gene::new("TELOMERE", "JUNK_DNA_TELOMERE_123");
        telomere.chromatin_state = ChromatinState::HeterochromatinConstitutive;
        let result_telo = telomere.express(&[], None, &[]);
        assert!(result_telo.unwrap_err().contains("OFF: L'ADN est trop serre"));
    }
}


