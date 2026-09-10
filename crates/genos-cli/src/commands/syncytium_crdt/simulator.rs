use super::crdt::SyncytiumEngine;
use super::types::{CrdtOp, CrdtOpKind};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::time::{sleep, Duration};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn coordinator_op(tick: u64) -> CrdtOp {
    let now = now_ms();
    let is_field = tick % 2 == 0;
    if is_field {
        CrdtOp {
            op_id: format!("coord-field-{}", tick),
            lamport: 0,
            timestamp_ms: now,
            agent_id: "agent-coord-01".to_string(),
            role: "shared_state_coordinator".to_string(),
            kind: CrdtOpKind::SetField {
                key: "mission_epoch".to_string(),
                value: serde_json::json!({ "tick": tick, "status": "synchronized" }),
            },
        }
    } else {
        CrdtOp {
            op_id: format!("coord-cursor-{}", tick),
            lamport: 0,
            timestamp_ms: now,
            agent_id: "agent-coord-01".to_string(),
            role: "shared_state_coordinator".to_string(),
            kind: CrdtOpKind::UpdateCursor {
                line: 1,
                column: (tick % 40) as u32 + 1,
                selection: Some((1, (tick % 40) as u32 + 5)),
            },
        }
    }
}

fn executor_op(tick: u64) -> CrdtOp {
    let now = now_ms();
    let snippets = [
        "// [Syncytium CRDT] Parallel Slice\n",
        "pub fn process_stream(data: &[u8]) -> Result<usize, Error> {\n",
        "    let len = data.len();\n",
        "    validate_bounds(len)?;\n",
        "    Ok(len)\n}\n",
    ];
    let idx = (tick as usize) % snippets.len();
    CrdtOp {
        op_id: format!("exec-insert-{}", tick),
        lamport: 0,
        timestamp_ms: now,
        agent_id: "agent-exec-02".to_string(),
        role: "parallel_executor".to_string(),
        kind: CrdtOpKind::InsertText {
            index: idx * 25,
            text: snippets[idx].to_string(),
        },
    }
}

fn guardian_op(tick: u64) -> CrdtOp {
    let now = now_ms();
    let invariant_name = if tick % 3 == 0 {
        "causal_ordering"
    } else if tick % 3 == 1 {
        "memory_invariants"
    } else {
        "no_state_divergence"
    };
    CrdtOp {
        op_id: format!("guard-inv-{}", tick),
        lamport: 0,
        timestamp_ms: now,
        agent_id: "agent-guard-03".to_string(),
        role: "consistency_guardian".to_string(),
        kind: CrdtOpKind::CheckInvariant {
            name: invariant_name.to_string(),
            passed: true,
            error: None,
        },
    }
}

fn integrator_op(tick: u64) -> CrdtOp {
    let now = now_ms();
    CrdtOp {
        op_id: format!("integ-cursor-{}", tick),
        lamport: 0,
        timestamp_ms: now,
        agent_id: "agent-integ-04".to_string(),
        role: "integration_executor".to_string(),
        kind: CrdtOpKind::UpdateCursor {
            line: ((tick % 10) + 2) as u32,
            column: ((tick * 3) % 60) as u32 + 1,
            selection: None,
        },
    }
}

async fn run_simulation_tick(engine: &SyncytiumEngine, tick: u64) {
    let op = match tick % 4 {
        0 => coordinator_op(tick),
        1 => executor_op(tick),
        2 => guardian_op(tick),
        _ => integrator_op(tick),
    };
    engine.apply_op(op).await;
}

pub async fn run_forever(engine: Arc<SyncytiumEngine>) {
    let mut tick = 0u64;
    loop {
        run_simulation_tick(&engine, tick).await;
        tick += 1;
        sleep(Duration::from_millis(300)).await;
    }
}

pub async fn run_one_pass(engine: &SyncytiumEngine) {
    for tick in 0..8 {
        run_simulation_tick(engine, tick).await;
    }
}
