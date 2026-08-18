use super::*;
use genos_core::Locus;
use genos_core::RecombinationStrategy;

#[test]
fn test_dominant_recessive() {
    let locus_a = Locus { gene_name: "trait".to_string(), value: 0.2, epigenetic_marker: 0.1 };
    let locus_b = Locus { gene_name: "trait".to_string(), value: 0.8, epigenetic_marker: 0.0 };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(&locus_a, &locus_b, false, &RecombinationStrategy::DominantRecessive, &mut prng);
    assert_eq!(res.value, 0.8);
}

#[test]
fn test_epistatic_masking() {
    let locus_a = Locus { gene_name: "trait".to_string(), value: 0.2, epigenetic_marker: 0.9 };
    let locus_b = Locus { gene_name: "trait".to_string(), value: 0.8, epigenetic_marker: 0.1 };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(&locus_a, &locus_b, false, &RecombinationStrategy::Epistatic, &mut prng);
    assert_eq!(res.value, 0.2);
}

#[test]
fn test_gaussian_recombination() {
    let locus_a = Locus { gene_name: "trait".to_string(), value: 0.2, epigenetic_marker: 0.0 };
    let locus_b = Locus { gene_name: "trait".to_string(), value: 0.8, epigenetic_marker: 0.0 };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(&locus_a, &locus_b, false, &RecombinationStrategy::Gaussian, &mut prng);
    assert!(res.value > 0.0 && res.value < 1.0);
}

#[test]
fn test_uniform_crossover() {
    let locus_a = Locus { gene_name: "trait".to_string(), value: 0.2, epigenetic_marker: 0.0 };
    let locus_b = Locus { gene_name: "trait".to_string(), value: 0.8, epigenetic_marker: 0.0 };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(&locus_a, &locus_b, false, &RecombinationStrategy::UniformCrossover { mix_probability: 1.0 }, &mut prng);
    assert_eq!(res.value, 0.8);
    
    let res = super::breeding::calculate_recombined_locus(&locus_a, &locus_b, false, &RecombinationStrategy::UniformCrossover { mix_probability: 0.0 }, &mut prng);
    assert_eq!(res.value, 0.2);
}
