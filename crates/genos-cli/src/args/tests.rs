use super::Cli;
use clap::Parser;

#[test]
fn canonical_agent_primitives_parse() {
    let commands = [
        vec!["genos", "agent", "init"],
        vec!["genos", "agent", "snapshot", "capsule-1"],
        vec!["genos", "agent", "restore", "capsule-1"],
        vec![
            "genos",
            "agent",
            "fork",
            "capsule-1",
            "--branch",
            "A=hypothesis",
        ],
        vec!["genos", "agent", "mutate", "genome.yaml"],
        vec!["genos", "agent", "run", "capsule-1", "--command", "echo ok"],
        vec!["genos", "agent", "diff", "snapshot-a", "snapshot-b"],
        vec!["genos", "agent", "merge", "merge.yaml"],
        vec!["genos", "agent", "lineage"],
        vec!["genos", "agent", "replay"],
    ];

    for command in commands {
        assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
    }
}

#[test]
fn platform_commands_parse() {
    assert!(Cli::try_parse_from(["genos", "platform", "status"]).is_ok());
    assert!(Cli::try_parse_from(["genos", "platform", "ingest", "guide.md"]).is_ok());
    assert!(
        Cli::try_parse_from(["genos", "platform", "search", "durable", "--limit", "3"]).is_ok()
    );
}

#[test]
fn hallucination_commands_parse() {
    let commands = [
        vec![
            "genos",
            "hallucination",
            "detect",
            "--snapshot",
            "snap.json",
        ],
        vec!["genos", "hallucination", "detect", "--trace", "trace.jsonl"],
        vec![
            "genos",
            "hallucination",
            "detect",
            "--snapshot",
            "snap.json",
            "--fail-on-findings",
        ],
        vec![
            "genos",
            "hallucination",
            "inject",
            "--snapshot",
            "snap.json",
            "--target-belief",
            "weather",
        ],
        vec![
            "genos",
            "hallucination",
            "test",
            "--suite",
            "suite.yaml",
            "--snapshot",
            "snap.json",
        ],
        vec![
            "genos",
            "hallucination",
            "extract",
            "--snapshot",
            "snap.json",
        ],
        vec![
            "genos",
            "hallucination",
            "analyze",
            "--snapshot",
            "snap.json",
        ],
        vec![
            "genos",
            "hallucination",
            "correct",
            "--agent-id",
            "agent-1",
            "--snapshot",
            "snap.json",
            "--expect-rejections",
        ],
        vec![
            "genos",
            "hallucination",
            "simulate",
            "--model",
            "fake-gpt",
            "--snapshot",
            "snap.json",
        ],
    ];

    for command in commands {
        assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
    }
}

#[test]
fn viral_dynamics_commands_parse() {
    let commands = [
        vec![
            "genos",
            "resilience",
            "viral-status",
            "--agent-id",
            "worker_1",
            "--failures",
            "4",
            "--progress",
            "0.1",
        ],
        vec!["genos", "resilience", "burst", "--genome-id", "g1"],
        vec![
            "genos",
            "resilience",
            "cassette-integrate",
            "--genome-id",
            "g1",
            "--cassette-id",
            "c1",
            "--payload",
            "retry with backoff",
            "--signature",
            "0.1",
            "0.2",
            "0.3",
        ],
        vec![
            "genos",
            "resilience",
            "cassette-induce",
            "--genome-id",
            "g1",
            "--failures",
            "3",
            "--progress",
            "0.4",
        ],
        vec![
            "genos",
            "resilience",
            "transduce",
            "--capsule-id",
            "cap1",
            "--from-genome",
            "g1",
            "--payload",
            "delta",
            "--proof-hash",
            "sha256:abc",
        ],
    ];
    for command in commands {
        assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
    }
}

#[test]
fn virophage_commands_parse() {
    let commands = [
        vec![
            "genos",
            "resilience",
            "virophage-deploy",
            "--session-id",
            "hp1",
            "--source-signature",
            "inject_web_md",
        ],
        vec![
            "genos",
            "resilience",
            "virophage-observe",
            "--session-id",
            "hp1-0",
            "--gene-hash",
            "h1",
            "--embedding",
            "0.4",
            "0.2",
        ],
        vec![
            "genos",
            "resilience",
            "virophage-harvest",
            "--session-id",
            "hp1-0",
        ],
    ];
    for command in commands {
        assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
    }
}

#[test]
fn biomimicry_votes_parse() {
    assert!(Cli::try_parse_from([
        "genos",
        "biomimicry",
        "swarm-consensus",
        "--target",
        "adr",
        "--vote",
        "explore"
    ])
    .is_ok());
    assert!(
        Cli::try_parse_from(["genos", "biomimicry", "swarm-consensus", "--target", "adr"])
            .is_err(),
        "at least one --vote is required"
    );
}

#[test]
fn division_commands_parse() {
    let commands = [
        vec!["genos", "division", "mitosis", "capsule-1", "--count", "3"],
        vec!["genos", "division", "fission", "capsule-1", "--count", "4"],
        vec![
            "genos",
            "division",
            "bud",
            "capsule-1",
            "--label",
            "lint",
            "--steps",
            "5",
        ],
        vec![
            "genos",
            "division",
            "schizogony",
            "capsule-1",
            "--branch",
            "dfs=depth-first",
            "--branch",
            "bfs=breadth-first",
        ],
    ];

    for command in commands {
        assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
    }
}

#[test]
fn experiment_direct_input_modes_parse() {
    let commands = [
        vec![
            "genos",
            "experiment",
            "workspace",
            "--repo",
            "calculator",
            "--plan",
            "workspace.yaml",
        ],
        vec![
            "genos",
            "experiment",
            "incident",
            "--snapshot",
            "production@incident-42",
            "--evidence",
            "evidence.yaml",
            "--search-plan",
            "search.yaml",
        ],
        vec![
            "genos",
            "experiment",
            "scientific",
            "--dataset",
            "records.txt",
            "--research-plan",
            "research.yaml",
        ],
        vec![
            "genos",
            "experiment",
            "security-coevolution",
            "--environment",
            "lab.yaml",
            "--evolution-plan",
            "evolution.yaml",
        ],
        vec![
            "genos",
            "experiment",
            "bug-investigation",
            "--repo",
            "service",
            "--plan",
            "hypotheses.yaml",
        ],
    ];

    for command in commands {
        assert!(Cli::try_parse_from(command.clone()).is_ok(), "{command:?}");
    }
}

#[test]
fn experiment_manifest_modes_remain_compatible() {
    for subcommand in [
        "workspace",
        "incident",
        "scientific",
        "security-coevolution",
        "bug-investigation",
    ] {
        let command = ["genos", "experiment", subcommand, "experiment.yaml"];
        assert!(Cli::try_parse_from(command).is_ok(), "{command:?}");
    }
}
