use genos_orchestrator::genos_store::{
    BurialContext, FossilizationMode, Melanosome, PhenotypeClass,
};
use genos_orchestrator::GenosEcosystem;

#[test]
fn orchestrator_can_fossilize_arbitrarily() {
    let mut eco = GenosEcosystem::new("Overmind");

    let mut ctx = BurialContext::new("lineage_arbitrary", "autonomous pruning");
    ctx.mode = FossilizationMode::Trace;
    ctx.hard_parts = vec!["genome".into(), "provenance".into()];
    ctx.soft_parts_lost = vec!["volatile_context".into()];
    ctx.phenotype_markers = vec![
        Melanosome::from_outcome("outcome", "validated", true),
        Melanosome::from_outcome("risk", "contained", true),
        Melanosome::from_outcome("latency", "breached", false),
    ];
    ctx.mineral_payload = serde_json::json!({ "certificate": "ev-42" });

    let record = eco.bury_fossil(ctx);
    assert_eq!(record.mode, FossilizationMode::Trace);
    assert!(record.verify_integrity());
    assert_eq!(record.phenotype_markers.len(), 3);
    assert!((record.conservation_quality - 2.0 / 3.0).abs() < 1e-9);
    assert_eq!(eco.fossil_history().len(), 1);

    let specimen = eco.excavate_fossil(&record.fossil_id).expect("specimen");
    assert!(specimen.integrity_verified);
    assert_eq!(specimen.reading.inferred_class, PhenotypeClass::SafeSuccess);

    let strata = eco.fossil_strata();
    assert_eq!(strata.len(), 1);
    assert_eq!(strata[0].fossil_count, 1);
}

#[test]
fn orchestrator_fossil_rejects_tampering() {
    let mut eco = GenosEcosystem::new("Overmind");
    let record = eco.bury_fossil(BurialContext::new("lineage_y", "apoptosis"));
    assert!(record.verify_integrity());

    let mut tampered = record.clone();
    tampered.reason = "rewritten history".into();
    assert!(!tampered.verify_integrity(), "toute réécriture est détectée");

    // Le fossile reste terminal : l'excavation ne retire ni ne ressuscite la lignée.
    let specimen = eco.excavate_fossil(&record.fossil_id).expect("specimen");
    assert_eq!(specimen.record.fossil_id, record.fossil_id);
    assert!(specimen.integrity_verified);
    assert_eq!(eco.fossil_history().len(), 1);
}
