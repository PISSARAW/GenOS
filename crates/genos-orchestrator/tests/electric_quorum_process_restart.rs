use genos_orchestrator::electric_quorum_runtime::{ElectricMissionVote, ElectricQuorumRequest};
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[test]
fn accepted_electric_quorum_restores_from_journal_in_child_process() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-electric-quorum-{nonce}.jsonl"));
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("electric-quorum-source");
    source.set_mission_id(mission);
    source.orchestrator.create_tissue("Voters", "Mission").unwrap();
    let participants = (0..3).map(|index| source.orchestrator.add_worker(
        "Voters", AgentCell::new(format!("voter-{index}"), "vote", "participant"),
    ).unwrap()).collect::<Vec<_>>();
    let request = make_request("process-restart-proposal", &participants);
    let receipt = source.discharge_electric_under_quorum_durable(
        request,
        &BiologicalReceiptStore::open(&path),
    ).unwrap();
    assert_eq!(receipt["accepted"], true);
    drop(source);

    let participants_text = participants.iter().map(Uuid::to_string).collect::<Vec<_>>().join(",");
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "electric_quorum_replay_child", "--nocapture"])
        .env("GENOS_ELECTRIC_QUORUM_JOURNAL", &path)
        .env("GENOS_ELECTRIC_QUORUM_MISSION", mission.to_string())
        .env("GENOS_ELECTRIC_QUORUM_PARTICIPANTS", participants_text)
        .output().unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "child replay failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn electric_quorum_replay_child() {
    let Ok(path) = std::env::var("GENOS_ELECTRIC_QUORUM_JOURNAL") else { return; };
    let mission = std::env::var("GENOS_ELECTRIC_QUORUM_MISSION").unwrap().parse::<Uuid>().unwrap();
    let participant_ids = std::env::var("GENOS_ELECTRIC_QUORUM_PARTICIPANTS").unwrap()
        .split(',').map(|value| value.parse::<Uuid>().unwrap()).collect::<Vec<_>>();
    let request = make_request("process-restart-proposal", &participant_ids);
    let store = BiologicalReceiptStore::open(path);
    let idempotency_key = format!("{mission}:{}", request.proposal_id);
    let receipt = store.find_idempotent_receipt("genos.electric-quorum-receipt/v1", &idempotency_key)
        .unwrap().unwrap();
    let mut recovered = GenosEcosystem::new("electric-quorum-recovered");
    recovered.set_mission_id(mission);
    recovered.replay_electric_quorum(&request, receipt.clone()).unwrap();
    assert!(recovered.electric_organ.electrocytes.iter().all(|cell| cell.is_depolarized));
    assert_eq!(store.read_all().unwrap().len(), 1);
    assert_eq!(receipt["accepted"], true);
}

fn make_request(proposal_id: &str, participants: &[Uuid]) -> ElectricQuorumRequest {
    let expires_at_unix_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap()
        .as_millis() as u64 + 10_000;
    ElectricQuorumRequest {
        proposal_id: proposal_id.into(),
        expires_at_unix_ms,
        votes: participants.iter().map(|participant_cell_id| ElectricMissionVote {
            participant_cell_id: *participant_cell_id,
            approve: true,
        }).collect(),
    }
}
