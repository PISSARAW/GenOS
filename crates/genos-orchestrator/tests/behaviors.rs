use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::GenosEcosystem;

#[test]
fn feinte_glie_et_communication() {
    let mut eco = GenosEcosystem::new("Overmind");
    eco.orchestrator.create_tissue("Arena", "Exec").unwrap();
    let agent = eco
        .orchestrator
        .add_worker("Arena", AgentCell::new("agent", "a", "Worker"))
        .unwrap();

    // Feinte : insertion d'un ADN leurre.
    let genome = genos_orchestrator::genos_genome::Genome::new("BASE");
    let dna = genos_orchestrator::dna_ops::from_genome(&genome, "seed");
    eco.register_dna(agent, dna);
    let note = eco.feign(agent);
    assert!(note.contains("feinte"), "note = {note}");

    // Pipeline glial complet.
    let glia = eco.glial_pass();
    assert!(glia.contains("glial"), "glia = {glia}");

    // Communication (hors ligne : « Ping » court-circuite le réseau).
    let answer = eco.communicate("Ping");
    assert!(!answer.is_empty());
}
