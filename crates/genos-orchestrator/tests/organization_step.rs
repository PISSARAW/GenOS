use genos_orchestrator::organization_step::{
    adversarial_needs_recipient, aligned_heading, authority_for, follower_may_address,
    global_summary, slime_conductivity, step_family, volitive_step, weighted_barycenter,
    wolf_role,
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
fn execution_miroir_des_algorithmes_essaim() {
    assert!((weighted_barycenter(&[0.0, 10.0], &[1.0, 9.0]) - 9.0).abs() < 1e-9);
    assert!(aligned_heading(0.0, 1.0, 0.05) > 0.0);
    assert!((slime_conductivity(0.5, 1.0) - 0.55).abs() < 1e-9);
    assert!((slime_conductivity(0.5, 0.0) - 0.45).abs() < 1e-9);
    assert_eq!(wolf_role(0), "alpha");
    assert_eq!(wolf_role(3), "omega");
    assert!(volitive_step(0.0, 9.0, 0.1) > 0.0);
}

#[test]
fn resume_global_pondere() {
    let (support, reached, counted) = global_summary(&[1.0, 0.0], &[2.0, 0.0], 0.5);
    assert!((support - 1.0).abs() < 1e-9);
    assert!(reached);
    assert_eq!(counted, 1);
    assert_eq!(global_summary(&[], &[], 0.5), (0.0, false, 0));
}

#[test]
fn familles_de_pas() {
    assert_eq!(step_family("flocking_boids"), "swarm");
    assert_eq!(step_family("grey_wolf_optimizer"), "swarm");
    assert_eq!(step_family("brier_weighted_consensus"), "consensus");
    assert_eq!(step_family("stigmergy"), "trail");
    assert_eq!(step_family("specialist_expert_committee"), "committee");
}
