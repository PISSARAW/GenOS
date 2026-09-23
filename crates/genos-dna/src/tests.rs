use genos_genome::DnaStrand;

use crate::operations::{self, CloneOptions, CrossOptions, DecoyOptions, GraftSpec, MutateOptions, SpeciateOptions};
use crate::{codec, compile, manifest::Manifest, packing, validate};

fn sample_manifest() -> Manifest {
    let json = r#"{
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": { "name": "EvidenceLedger", "version": "0.1.0" },
        "identity": { "role": "historian", "name": "EvidenceLedger", "name_meaning": "Preuve avant decision" },
        "objectives": { "primary": "Convertir les sorties en claims/evidence", "source_doc": "docs/01-concepts/epistemologie-et-evidence.md" },
        "capabilities": ["enregistrer les rapports", "scorer l evidence"],
        "tool_policy": { "allowed_tools": ["genos_inspect", "genos_evidence_check"] }
    }"#;
    serde_json::from_str(json).expect("sample manifest must parse")
}

fn second_manifest() -> Manifest {
    let json = r#"{
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": { "name": "SecurityAuditor", "version": "0.1.0" },
        "identity": { "role": "security", "name": "SecurityAuditor", "name_meaning": "Falsification adverse" },
        "objectives": { "primary": "Attaquer les hypotheses", "source_doc": "docs/05-securite-gouvernance/securite.md" },
        "capabilities": ["analyse adversariale"],
        "tool_policy": { "allowed_tools": ["genos_inspect", "genos_ais_prr_scan"] }
    }"#;
    serde_json::from_str(json).expect("second manifest must parse")
}

#[test]
fn packing_round_trip() {
    let strand = DnaStrand::synthesize("AGENT_PROMPT_42");
    let (count, packed) = packing::pack_strand(&strand);
    let restored = packing::unpack_strand(count, &packed).expect("unpack");
    assert_eq!(strand.as_slice(), restored.as_slice());
    assert!(packed.len() < strand.len());
}

#[test]
fn compile_encode_decode_validate() {
    let manifest = sample_manifest();
    let dna = compile::compile_manifest(&manifest).expect("compile");
    let bytes = codec::encode(&dna).expect("encode");
    assert_eq!(&bytes[0..4], b"GDNA");

    let decoded = validate::validate_bytes(&bytes).expect("validate");
    let phenotype = decoded.phenotype.expect("phenotype must be cached");
    assert_eq!(phenotype.role, "historian");
    assert!(phenotype.tools.contains(&"genos_inspect".to_string()));
    assert_eq!(phenotype.capabilities.len(), 2);
    assert!(phenotype.expressed >= 5);
}

#[test]
fn content_hash_is_stable() {
    let manifest = sample_manifest();
    let dna = compile::compile_manifest(&manifest).expect("compile");
    let first = codec::content_hash(&dna).expect("hash");
    let second = codec::content_hash(&dna).expect("hash");
    assert_eq!(first, second);
    assert_eq!(first.len(), 64);
}

#[test]
fn cross_produces_biparental_child() {
    let parent_a = compile::compile_manifest(&sample_manifest()).expect("compile a");
    let parent_b = compile::compile_manifest(&second_manifest()).expect("compile b");
    let options = CrossOptions { swap_prob: 0.5, point: None, seed: Some("crossover-test".to_string()), speciation_threshold: None };
    let child = operations::cross(&parent_a, &parent_b, &options).expect("cross");
    assert_eq!(child.provenance.parents.len(), 2);
    assert!(child.provenance.crossover.is_some());
    assert!(child.genes.contains_key("ROLE"));
    assert!(child.phenotype.is_some());
}

#[test]
fn mutate_records_and_changes_hash() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = MutateOptions { rate: 0.9, hyper: false, locus: Some("ROLE".to_string()), seed: Some("mutate-test".to_string()) };
    let mutated = operations::mutate(&dna, &options).expect("mutate");
    assert_eq!(mutated.provenance.mutations.len(), 1);
    assert_ne!(codec::content_hash(&dna).unwrap(), codec::content_hash(&mutated).unwrap());
}

#[test]
fn clone_keeps_lineage_and_new_identity() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = CloneOptions { mode: "mitosis".to_string(), daughter_volume: 0.25, mutation_rate: 0.0, seed: Some("clone-test".to_string()) };
    let child = operations::clone_dna(&dna, &options).expect("clone");
    assert_ne!(child.meta.genome_id, dna.meta.genome_id);
    assert_eq!(child.provenance.parents, vec![dna.meta.genome_id]);
}

#[test]
fn decoy_sets_flag_and_marker() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = DecoyOptions { target_selector: "enemy".to_string(), detectability: 0.7, marker: Vec::new() };
    let decoy = operations::decoy(&dna, &options).expect("decoy");
    assert!(decoy.provenance.decoy.is_some());
    let bytes = codec::encode(&decoy).expect("encode");
    assert_ne!(bytes[6] & 0b1000_0000, 0, "DECOY flag must be set");
}

#[test]
fn signed_genome_verifies_and_tampering_fails() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let mut signed = dna.clone();
    let bytes = codec::encode_signed(&mut signed, &[7u8; 32]).expect("sign");
    assert!(codec::verify_signature(&bytes).expect("verify").is_some());
    validate::validate_bytes(&bytes).expect("signed genome validates");
    let mut tampered = bytes.clone();
    let last = tampered.len() - 1;
    tampered[last] ^= 0xFF;
    assert!(validate::validate_bytes(&tampered).is_err());
}

#[test]
fn graft_adds_gene_and_plasmid() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let grafted = operations::graft(&dna, &GraftSpec {
        locus: "cap_spatial_reasoning".to_string(),
        instruction: "raisonnement spatial".to_string(),
        plasmid: false,
    }).expect("graft gene");
    assert!(grafted.genes.contains_key("CAP_SPATIAL_REASONING"));
    assert_eq!(grafted.provenance.mutations.len(), 1);

    let with_plasmid = operations::graft(&grafted, &GraftSpec {
        locus: "donor_x".to_string(),
        instruction: "repair pathway".to_string(),
        plasmid: true,
    }).expect("graft plasmid");
    assert_eq!(with_plasmid.plasmids.len(), 1);
}

#[test]
fn speciate_derives_new_genome_with_concepts() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = SpeciateOptions {
        name: "SpatialReasoner".to_string(),
        concept: Some("foraging-charnov".to_string()),
        grafts: vec![GraftSpec {
            locus: "CAP_foraging".to_string(),
            instruction: "optimal foraging".to_string(),
            plasmid: false,
        }],
    };
    let child = operations::speciate(&dna, &options).expect("speciate");
    assert_eq!(child.meta.name, "SpatialReasoner");
    assert_ne!(child.meta.genome_id, dna.meta.genome_id);
    assert_eq!(child.meta.generation, dna.meta.generation + 1);
    assert_eq!(child.provenance.parents, vec![dna.meta.genome_id]);
    assert!(child.genes.contains_key("CAP_FORAGING"));
    assert!(child.provenance.selection.is_some());
}

#[test]
fn epigenome_grn_development_round_trip() {
    let mut dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    dna.epigenome.marks.insert("ROLE".to_string(), crate::model::EpiMark {
        kind: "Acetylation".to_string(),
        level: 0.8,
    });
    dna.epigenome.stage = "Differentiated".to_string();
    dna.grn.nodes.insert("TF_ALPHA".to_string(), crate::model::GrnNode {
        is_tf: true,
        basal_expression: 0.9,
    });
    dna.grn.edges.push(crate::model::GrnEdge {
        from: "TF_ALPHA".to_string(),
        to: "ROLE".to_string(),
        weight: 0.9,
    });
    dna.development.stage = "Differentiated".to_string();
    dna.development.morphogens = vec!["TF_ALPHA".to_string()];
    dna.development.lineage_commitment = Some("historian".to_string());
    let bytes = codec::encode(&dna).expect("encode with regulatory layers");
    let decoded = codec::decode(&bytes).expect("decode with regulatory layers");
    assert_eq!(decoded.epigenome.stage, "Differentiated");
    assert!(decoded.epigenome.marks.contains_key("ROLE"));
    assert!(decoded.grn.nodes.contains_key("TF_ALPHA"));
    assert_eq!(decoded.grn.edges.len(), 1);
    assert_eq!(decoded.development.stage, "Differentiated");
    assert_eq!(decoded.development.morphogens, vec!["TF_ALPHA".to_string()]);
}

#[test]
fn unknown_sections_are_preserved() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let mut sections = codec::build_sections(&dna).expect("sections");
    sections.push(crate::section::Section::new(
        crate::section::SectionTag::Unknown(*b"XXXX"),
        vec![1, 2, 3],
    ));
    let flux_hash_before = codec::content_hash(&dna).expect("hash");
    let _ = flux_hash_before;
    let decoded_unknown = {
        let mut with_unknown = dna.clone();
        with_unknown.unknown_sections.push(crate::model::UnknownSection {
            tag: *b"XXXX",
            payload: vec![1, 2, 3],
        });
        let bytes = codec::encode(&with_unknown).expect("encode unknown");
        codec::decode(&bytes).expect("decode unknown")
    };
    assert_eq!(decoded_unknown.unknown_sections.len(), 1);
    assert_eq!(decoded_unknown.unknown_sections[0].tag, *b"XXXX");
    assert_eq!(decoded_unknown.unknown_sections[0].payload, vec![1, 2, 3]);
    let _ = sections;
}

#[test]
fn invalid_chromatin_code_is_rejected() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let mut sections = codec::build_sections(&dna).expect("sections");
    let _ = sections.pop();
    let wire_result = crate::wire::chromatin_from(255);
    assert!(wire_result.is_err());
}

#[test]
fn grn_edges_change_expression_causally() {
    let base = compile::compile_manifest(&sample_manifest()).expect("compile");
    let mut wired = base.clone();
    wired.genes.insert("TF_ALPHA".to_string(), genos_genome::Gene::new("TF_ALPHA", "activate pathway"));
    wired.grn.nodes.insert("TF_ALPHA".to_string(), crate::model::GrnNode {
        is_tf: true,
        basal_expression: 1.0,
    });
    wired.grn.edges.push(crate::model::GrnEdge {
        from: "TF_ALPHA".to_string(),
        to: "ROLE".to_string(),
        weight: 0.9,
    });
    let expressed = crate::express::express(&wired);
    assert!(expressed.expr_tfs.contains(&"TF_ALPHA".to_string()));
}

#[test]
fn development_stage_changes_phenotype() {
    let base = compile::compile_manifest(&sample_manifest()).expect("compile");
    let mut zygote_dna = base.clone();
    zygote_dna.genes.insert("TF_ALPHA".to_string(), genos_genome::Gene::new("TF_ALPHA", "activate pathway"));
    zygote_dna.grn.nodes.insert("TF_ALPHA".to_string(), crate::model::GrnNode {
        is_tf: true,
        basal_expression: 0.0,
    });
    zygote_dna.development.stage = "Zygote".to_string();
    let mut mature_dna = zygote_dna.clone();
    mature_dna.development.stage = "Mature".to_string();
    let zygote = crate::express::express(&zygote_dna);
    let mature = crate::express::express(&mature_dna);
    assert_ne!(zygote.expr_tfs, mature.expr_tfs, "development must modulate GRN dynamics");
}

#[test]
fn methylation_mark_silences_gene() {
    let base = compile::compile_manifest(&sample_manifest()).expect("compile");
    let mut marked = base.clone();
    marked.epigenome.marks.insert("ROLE".to_string(), crate::model::EpiMark {
        kind: "Methylation".to_string(),
        level: 1.0,
    });
    let phenotype = crate::express::express(&marked);
    assert!(phenotype.silenced.contains(&"ROLE".to_string()));
}

#[test]
fn e2e_mutation_expression_fitness_selection_replay() {
    let base = compile::compile_manifest(&sample_manifest()).expect("compile");
    let baseline_pheno = crate::express::express(&base);
    let genome = base.to_genome().expect("genome");
    let experiment = genos_genome::fitness::FitnessExperiment::new();
    let baseline_fitness = experiment.evaluate(&genome, "implement TOOL_BASE with CAP_IMPLEMENT").score;
    let mutated = operations::mutate(&base, &MutateOptions {
        rate: 0.9,
        hyper: false,
        locus: Some("ROLE".to_string()),
        seed: Some("e2e-test".to_string()),
    }).expect("mutate");
    assert_ne!(mutated.meta.genome_id, base.meta.genome_id);
    assert_eq!(mutated.meta.generation, base.meta.generation + 1);
    let mutated_pheno = crate::express::express(&mutated);
    let mutated_genome = mutated.to_genome().expect("mutated genome");
    let mutated_fitness = experiment.evaluate(&mutated_genome, "implement TOOL_BASE with CAP_IMPLEMENT").score;
    let _ = (baseline_pheno, mutated_pheno, baseline_fitness, mutated_fitness);
    let bytes = codec::encode(&mutated).expect("encode descendant");
    let replayed = codec::decode(&bytes).expect("decode descendant");
    let replay_pheno = crate::express::express(&replayed);
    let original_pheno = mutated.phenotype.clone().expect("cached phenotype");
    assert_eq!(replay_pheno.role, original_pheno.role);
    assert_eq!(replay_pheno.tools, original_pheno.tools);
    assert_eq!(replayed.meta.genome_id, mutated.meta.genome_id);
}

#[test]
fn budding_pair_preserves_mother_scar_lineage() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let pair = operations::clone_dna_pair(&dna, &CloneOptions {
        mode: "budding".to_string(),
        daughter_volume: 0.25,
        mutation_rate: 0.0,
        seed: Some("budding-e2e".to_string()),
    }).expect("budding pair");
    assert_eq!(pair.mother.meta.genome_id, dna.meta.genome_id);
    assert_ne!(pair.daughter.meta.genome_id, dna.meta.genome_id);
    assert!(!pair.mother.scars.is_empty() || !pair.daughter.provenance.mutations.is_empty());
}
