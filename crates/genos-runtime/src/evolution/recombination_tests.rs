use genos_core::Locus;
use genos_core::RecombinationStrategy;

#[test]
fn test_dominant_recessive() {
    let locus_a = Locus {
        gene_name: "trait".to_string(),
        value: 0.2,
        epigenetic_marker: 0.1,
    };
    let locus_b = Locus {
        gene_name: "trait".to_string(),
        value: 0.8,
        epigenetic_marker: 0.0,
    };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(
        &locus_a,
        &locus_b,
        false,
        &RecombinationStrategy::DominantRecessive,
        &mut prng,
    );
    assert_eq!(res.value, 0.8);
}

#[test]
fn test_epistatic_masking() {
    let locus_a = Locus {
        gene_name: "trait".to_string(),
        value: 0.2,
        epigenetic_marker: 0.9,
    };
    let locus_b = Locus {
        gene_name: "trait".to_string(),
        value: 0.8,
        epigenetic_marker: 0.1,
    };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(
        &locus_a,
        &locus_b,
        false,
        &RecombinationStrategy::Epistatic,
        &mut prng,
    );
    assert_eq!(res.value, 0.2);
}

#[test]
fn test_gaussian_recombination() {
    let locus_a = Locus {
        gene_name: "trait".to_string(),
        value: 0.2,
        epigenetic_marker: 0.0,
    };
    let locus_b = Locus {
        gene_name: "trait".to_string(),
        value: 0.8,
        epigenetic_marker: 0.0,
    };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(
        &locus_a,
        &locus_b,
        false,
        &RecombinationStrategy::Gaussian,
        &mut prng,
    );
    assert!(res.value > 0.0 && res.value < 1.0);
}

#[test]
fn test_uniform_crossover() {
    let locus_a = Locus {
        gene_name: "trait".to_string(),
        value: 0.2,
        epigenetic_marker: 0.0,
    };
    let locus_b = Locus {
        gene_name: "trait".to_string(),
        value: 0.8,
        epigenetic_marker: 0.0,
    };
    let mut prng = 42;

    let res = super::breeding::calculate_recombined_locus(
        &locus_a,
        &locus_b,
        false,
        &RecombinationStrategy::UniformCrossover {
            mix_probability: 1.0,
        },
        &mut prng,
    );
    assert_eq!(res.value, 0.8);

    let res = super::breeding::calculate_recombined_locus(
        &locus_a,
        &locus_b,
        false,
        &RecombinationStrategy::UniformCrossover {
            mix_probability: 0.0,
        },
        &mut prng,
    );
    assert_eq!(res.value, 0.2);
}

fn locus(gene: &str, value: f32) -> Locus {
    Locus {
        gene_name: gene.to_string(),
        value,
        epigenetic_marker: 0.0,
    }
}

#[test]
fn test_multi_point_crossover_alternates_segments() {
    // 6 loci, 2 points de cassure : segments A|B|A|B attendus.
    let genes = ["g0", "g1", "g2", "g3", "g4", "g5"];
    let alice_values = [0.0_f32, 0.0, 0.0, 0.0, 0.0, 0.0];
    let bob_values = [1.0_f32, 1.0, 1.0, 1.0, 1.0, 1.0];
    let mut prng = 7;

    for (i, gene) in genes.iter().enumerate() {
        let a = locus(gene, alice_values[i]);
        let b = locus(gene, bob_values[i]);
        let segment_is_bob = (i * 2 / genes.len()) % 2 == 1;
        let res = super::breeding::calculate_recombined_locus(
            &a,
            &b,
            segment_is_bob,
            &RecombinationStrategy::MultiPointCrossover { points: 2 },
            &mut prng,
        );
        let expected = if segment_is_bob { 1.0 } else { 0.0 };
        assert_eq!(
            res.value,
            expected,
            "locus {i} devrait suivre le segment {}",
            if segment_is_bob { "B" } else { "A" }
        );
    }
}

#[test]
fn test_hotspot_recombination_increases_local_shuffling() {
    let a = locus("hot_gene", 0.0);
    let b = locus("hot_gene", 1.0);

    // Sur un hotspot, le choix du parent est tiré au sort : sur beaucoup de
    // seeds, on doit observer un mélange des deux parents.
    let mut from_a = 0;
    let mut from_b = 0;
    for seed in 1..200u64 {
        let mut prng = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
        let res = super::breeding::calculate_recombined_locus(
            &a,
            &b,
            false,
            &RecombinationStrategy::HotspotRecombination {
                hotspot_genes: vec!["hot_gene".to_string()],
            },
            &mut prng,
        );
        if res.value < 0.5 {
            from_a += 1;
        } else {
            from_b += 1;
        }
    }
    assert!(from_a > 40 && from_b > 40, "brassage local attendu (a={from_a}, b={from_b})");

    // Un gène hors hotspot suit le croisement standard (segment alice).
    let cold = locus("cold_gene", 0.0);
    let cold_b = locus("cold_gene", 1.0);
    let mut prng = 99;
    let res = super::breeding::calculate_recombined_locus(
        &cold,
        &cold_b,
        false,
        &RecombinationStrategy::HotspotRecombination {
            hotspot_genes: vec!["hot_gene".to_string()],
        },
        &mut prng,
    );
    assert_eq!(res.value, 0.0, "hors hotspot, le schéma mono-point s'applique");
}
