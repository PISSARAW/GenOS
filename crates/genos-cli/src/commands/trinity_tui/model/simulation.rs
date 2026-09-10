use super::WorldState;

/// One scripted narrative beat: an optional status transition plus a log line.
struct StepScript {
    status: Option<&'static str>,
    log: &'static str,
}

/// Deterministic outcome recorded once a world's scripted run finishes.
struct FinalOutcome {
    status: &'static str,
    evidence_score: f64,
    verdict: &'static str,
    findings: &'static [&'static str],
    log: &'static str,
}

/// Full scripted narrative for one demo world (used only in `--simulation` mode).
struct WorldScript {
    tokens_per_step: u32,
    steps: &'static [StepScript],
    outcome: FinalOutcome,
}

const WORLD_1: WorldScript = WorldScript {
    tokens_per_step: 185,
    steps: &[
        StepScript { status: Some("SPAWNING"), log: "[0.2s] 🚀 VFS capsule provisioned (ephemeral scratch)" },
        StepScript { status: Some("RUNNING"), log: "[0.6s] ⚡ Direct prompt parse: scanning for 'i', 'l', 'd'" },
        StepScript { status: None, log: "[1.0s] 📝 Implementing naive recursive descent parser" },
        StepScript { status: None, log: "[1.4s] 🔨 parse_int: handles 'i42e' -> Ok(42)" },
        StepScript { status: None, log: "[1.9s] 🔨 parse_string: handles '4:spam' -> Ok(\"spam\")" },
        StepScript { status: None, log: "[2.4s] 🔨 parse_list: recursive call for items" },
        StepScript { status: None, log: "[2.9s] ⚠️ WARNING: No recursion depth limit configured!" },
        StepScript { status: None, log: "[3.3s] ⚠️ WARNING: 'i03e' accepted (leading zero bug)" },
        StepScript { status: None, log: "[3.8s] 🧪 Basic tests: 12/15 passed. Edge cases failed." },
    ],
    outcome: FinalOutcome {
        status: "FINISHED",
        evidence_score: 0.72,
        verdict: "REJECTED (INCOMPLETE)",
        findings: &["Recursion stack overflow risk", "Missing BEP 0003 leading zero checks", "Unsorted dict keys tolerated"],
        log: "[4.2s] 📊 Dossier sealed: 0.72 score (3 critical flaws)",
    },
};

const WORLD_2: WorldScript = WorldScript {
    tokens_per_step: 420,
    steps: &[
        StepScript { status: Some("DECOMPOSING"), log: "[0.2s] 📐 Invariant analysis from BEP 0003 specification" },
        StepScript { status: None, log: "[0.7s] 📐 Spec rule 1: No leading zeroes allowed in integers" },
        StepScript { status: Some("MODELING"), log: "[1.1s] 📐 Spec rule 2: Negative zero ('i-0e') strictly illegal" },
        StepScript { status: None, log: "[1.6s] 🏗️ Zero-copy AST design: enum BencodeValue<'a>" },
        StepScript { status: Some("EXECUTING"), log: "[2.1s] 🛡️ Iterative parser with MAX_DEPTH = 128 guardrail" },
        StepScript { status: None, log: "[2.6s] 🔍 Lexicographical key sort validator implemented" },
        StepScript { status: None, log: "[3.1s] 🧪 Running 18 canonical BEP 0003 test vectors" },
        StepScript { status: None, log: "[3.6s] ✔️ All 18 canonical specification tests passed" },
        StepScript { status: Some("VERIFYING"), log: "[4.1s] 📜 Formal invariant claims generated for dossier" },
    ],
    outcome: FinalOutcome {
        status: "FINISHED",
        evidence_score: 0.94,
        verdict: "COMPATIBLE",
        findings: &["Zero-copy slice representation", "100% BEP 0003 grammar compliance", "Iterative depth protection (128)"],
        log: "[4.5s] 📊 Dossier sealed: 0.94 score (18/18 tests pass)",
    },
};

const WORLD_3: WorldScript = WorldScript {
    tokens_per_step: 510,
    steps: &[
        StepScript { status: Some("CHALLENGING"), log: "[0.2s] ⚔️ Autonomous adversarial fuzzer generator launched" },
        StepScript { status: None, log: "[0.7s] 💥 Fuzz attack 1: integer overflow i9223372036854775808e" },
        StepScript { status: Some("REPAIRING"), log: "[1.2s] 🔧 Patch applied: checked_add overflow detection" },
        StepScript { status: None, log: "[1.7s] 💥 Fuzz attack 2: truncated payload '10:abc'" },
        StepScript { status: None, log: "[2.2s] 🔧 Patch applied: UnexpectedEof with exact byte index" },
        StepScript { status: None, log: "[2.7s] 💥 Fuzz attack 3: non-canonical unsorted dictionary" },
        StepScript { status: Some("REPAIRING"), log: "[3.2s] 🔧 Patch applied: pairwise byte order comparator" },
        StepScript { status: None, log: "[3.7s] 🛡️ 4/4 adversarial vectors neutralized and verified" },
        StepScript { status: Some("VERIFYING"), log: "[4.2s] 🔐 Cryptographic test receipts compiled to evidence" },
    ],
    outcome: FinalOutcome {
        status: "FINISHED",
        evidence_score: 0.98,
        verdict: "WINNER (PROMOTED)",
        findings: &["Overflow & truncated EOF defended", "Lexicographic dict key enforcement", "Cryptographic falsification receipts"],
        log: "[4.8s] 🏆 Dossier sealed: 0.98 score (Vulnerabilities neutralized)",
    },
};

fn script_for(world_id: u8) -> &'static WorldScript {
    match world_id {
        1 => &WORLD_1,
        2 => &WORLD_2,
        _ => &WORLD_3,
    }
}

fn apply_outcome(world: &mut WorldState, outcome: &FinalOutcome) {
    world.status = outcome.status.to_string();
    world.evidence_score = outcome.evidence_score;
    world.verdict = outcome.verdict.to_string();
    world.key_findings = outcome.findings.iter().map(|finding| finding.to_string()).collect();
    world.logs.push(outcome.log.to_string());
}

/// Advance one world's scripted demo narrative by a single tick.
/// Data-driven so the 3 worlds share one code path instead of duplicated logic.
pub fn advance_world(world: &mut WorldState, step: usize) {
    let script = script_for(world.id);
    world.tokens += script.tokens_per_step;
    world.progress = (step * 10).min(100) as u16;

    match script.steps.get(step.saturating_sub(1)) {
        Some(beat) => {
            if let Some(status) = beat.status {
                world.status = status.to_string();
            }
            world.logs.push(beat.log.to_string());
        }
        None => apply_outcome(world, &script.outcome),
    }
}
