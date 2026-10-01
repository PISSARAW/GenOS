use genos_orchestrator::organization_step::{
    adversarial_needs_recipient, authority_for, follower_may_address, step_family,
};

#[test]
fn autorite_couvre_les_19_organisations() {
    assert_eq!(authority_for("grey_wolf_optimizer", "alpha"), "leader");
    assert_eq!(authority_for("grey_wolf_optimizer", "omega"), "follower");
    assert_eq!(authority_for("specialist_expert_committee", "orchestrator"), "hub");
    assert_eq!(authority_for("red_blue_coevolution", "red_team"), "adversary");
    assert_eq!(authority_for("strategy_arena", "competitor"), "competitor");
    assert_eq!(authority_for("flocking_boids", "worker"), "member");
    assert_eq!(authority_for("unknown_org", "x"), "member");
}

#[test]
fn routage_ranked_et_adversarial() {
    assert!(!follower_may_address(false, "follower", false));
    assert!(follower_may_address(false, "follower", true));
    assert!(follower_may_address(false, "leader", false));
    assert!(adversarial_needs_recipient(false, false));
    assert!(!adversarial_needs_recipient(false, true));
    assert!(!adversarial_needs_recipient(true, false));
}

#[test]
fn familles_de_pas() {
    assert_eq!(step_family("flocking_boids"), "swarm");
    assert_eq!(step_family("grey_wolf_optimizer"), "swarm");
    assert_eq!(step_family("brier_weighted_consensus"), "consensus");
    assert_eq!(step_family("stigmergy"), "trail");
    assert_eq!(step_family("specialist_expert_committee"), "committee");
}
