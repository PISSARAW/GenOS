use genos_orchestrator::genos_biology::therapy::SystemicTherapy;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::GenosEcosystem;

#[test]
fn ecosystem_routes_scoped_nosology_therapy() {
    let eco = GenosEcosystem::new("therapy-integration");
    let mut patient = AgentCell::new("Patient", "Simulation", "Worker");
    patient
        .clinical
        .markers
        .insert("metal_toxin_load".into(), 0.75);

    let outcome = eco.apply_therapy(&mut patient, &SystemicTherapy::ChelationTherapy);

    assert_eq!(outcome.applied_markers, vec!["metal_toxin_load réduit"]);
    assert_eq!(patient.clinical.markers["metal_toxin_load"], 0.5);
}