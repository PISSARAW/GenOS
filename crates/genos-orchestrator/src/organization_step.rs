//! Parite Rust du pas d'organisation Node.
//! Miroir de `organizationAlgorithms.js` (AUTHORITY) et
//! `organizationRouting.js` (ranked + adversarial), sans persistance.

const TABLE: &[(&str, &[&str], &str, &str)] = &[
    ("grey_wolf_optimizer", &["alpha", "beta", "delta"], "leader", "follower"),
    ("specialist_expert_committee", &["orchestrator"], "hub", "spoke"),
    ("red_blue_coevolution", &["red", "blue"], "adversary", "observer"),
    ("hierarchical_merge", &["orchestrator", "host"], "root", "member"),
    ("blind_adversarial_review", &["critic", "review"], "critic", "member"),
    ("brier_weighted_consensus", &["expert", "forecaster"], "voter", "member"),
    ("quorum_with_abstention", &["voter", "member"], "voter", "member"),
    ("stigmergy", &["forager", "scout"], "forager", "member"),
    ("mycelial_routing", &["hypha", "router"], "router", "member"),
    ("dynamic_polyethism", &["generalist", "specialist"], "polyethic", "member"),
    ("strategy_arena", &["competitor", "champion"], "competitor", "observer"),
    ("competitive_arena", &["competitor", "champion"], "competitor", "observer"),
    ("memory_compilation", &["librarian", "compiler"], "compiler", "member"),
];

fn contains_any(haystack: &str, keys: &[&str]) -> bool {
    for key in keys {
        if haystack.contains(key) {
            return true;
        }
    }
    false
}

/// Autorite d'un role dans une organisation (19 organisations, defaut `member`).
pub fn authority_for(organization: &str, role: &str) -> &'static str {
    let lowered = role.to_lowercase();
    for entry in TABLE {
        if entry.0 == organization {
            if contains_any(&lowered, entry.1) {
                return entry.2;
            }
            return entry.3;
        }
    }
    "member"
}

/// Famille de pas pour le steering (aiguillage swarm vs guidance).
pub fn step_family(organization: &str) -> &'static str {
    match organization {
        "flocking_boids" | "fish_school_search" => "swarm",
        "slime_mould_network" | "grey_wolf_optimizer" => "swarm",
        "brier_weighted_consensus" | "quorum_with_abstention" => "consensus",
        "blind_adversarial_review" | "red_blue_coevolution" => "adversarial",
        "strategy_arena" | "competitive_arena" => "arena",
        "energy_huddle" => "resource",
        "network_silence" | "isolated_recovery" => "isolation",
        "memory_compilation" => "memory",
        "mycelial_routing" | "dynamic_polyethism" => "routing",
        "stigmergy" => "trail",
        _ => "committee",
    }
}

/// Un follower ranked ne peut adresser que l'orchestrateur.
pub fn follower_may_address(is_orchestrator: bool, authority: &str, to_orchestrator: bool) -> bool {
    if is_orchestrator {
        return true;
    }
    if authority == "leader" {
        return true;
    }
    to_orchestrator
}

/// Un worker adversarial doit designer un destinataire explicite.
pub fn adversarial_needs_recipient(is_orchestrator: bool, has_recipient: bool) -> bool {
    if is_orchestrator {
        return false;
    }
    !has_recipient
}
