#[cfg(test)]
mod tests {
    use crate::commands::syncytium_crdt::crdt::SyncytiumEngine;
    use crate::commands::syncytium_crdt::types::{CrdtOp, CrdtOpKind};

    #[tokio::test]
    async fn test_concurrent_crdt_edits_without_lock_corruption() {
        let engine = SyncytiumEngine::new();

        let op1 = CrdtOp {
            op_id: "op-1".to_string(),
            lamport: 1,
            timestamp_ms: 1000,
            agent_id: "agent-exec-1".to_string(),
            role: "parallel_executor".to_string(),
            kind: CrdtOpKind::InsertText {
                index: 0,
                text: "fn compute() {}".to_string(),
            },
        };

        let op2 = CrdtOp {
            op_id: "op-2".to_string(),
            lamport: 2,
            timestamp_ms: 1050,
            agent_id: "agent-guard-2".to_string(),
            role: "consistency_guardian".to_string(),
            kind: CrdtOpKind::SetField {
                key: "invariant_verified".to_string(),
                value: serde_json::json!(true),
            },
        };

        engine.apply_op(op1).await;
        engine.apply_op(op2).await;

        let snap = engine.snapshot().await;
        assert_eq!(snap.text_content, "fn compute() {}");
        assert_eq!(snap.shared_fields.get("invariant_verified"), Some(&serde_json::json!(true)));
        assert_eq!(snap.total_ops, 2);
    }

    #[tokio::test]
    async fn test_4_agents_cursors_tracking() {
        let engine = SyncytiumEngine::new();
        let roles = [
            ("coord-1", "shared_state_coordinator", 1, 10),
            ("exec-2", "parallel_executor", 2, 25),
            ("guard-3", "consistency_guardian", 3, 5),
            ("integ-4", "integration_executor", 4, 30),
        ];

        for (id, role, line, col) in roles {
            let op = CrdtOp {
                op_id: format!("cur-{}", id),
                lamport: 0,
                timestamp_ms: 2000,
                agent_id: id.to_string(),
                role: role.to_string(),
                kind: CrdtOpKind::UpdateCursor {
                    line,
                    column: col,
                    selection: Some((col, col + 4)),
                },
            };
            engine.apply_op(op).await;
        }

        let snap = engine.snapshot().await;
        assert_eq!(snap.cursors.len(), 4);
        let coord = snap.cursors.iter().find(|c| c.role == "shared_state_coordinator").unwrap();
        assert_eq!(coord.color, "#3b82f6");
        let exec = snap.cursors.iter().find(|c| c.role == "parallel_executor").unwrap();
        assert_eq!(exec.color, "#10b981");
    }

    #[tokio::test]
    async fn test_time_travel_rewind_millisecond_by_millisecond() {
        let engine = SyncytiumEngine::new();

        engine.apply_op(CrdtOp {
            op_id: "tt-1".to_string(),
            lamport: 1,
            timestamp_ms: 100,
            agent_id: "agent-1".to_string(),
            role: "parallel_executor".to_string(),
            kind: CrdtOpKind::InsertText {
                index: 0,
                text: "Hello ".to_string(),
            },
        }).await;

        engine.apply_op(CrdtOp {
            op_id: "tt-2".to_string(),
            lamport: 2,
            timestamp_ms: 200,
            agent_id: "agent-1".to_string(),
            role: "parallel_executor".to_string(),
            kind: CrdtOpKind::InsertText {
                index: 6,
                text: "Syncytium!".to_string(),
            },
        }).await;

        let live = engine.snapshot().await;
        assert_eq!(live.text_content, "Hello Syncytium!");

        let rewind_150 = engine.time_travel(150).await;
        assert_eq!(rewind_150.text_content, "Hello ");
        assert!(rewind_150.is_time_travel);
        assert_eq!(rewind_150.rewind_target_ms, Some(150));

        let rewind_250 = engine.time_travel(250).await;
        assert_eq!(rewind_250.text_content, "Hello Syncytium!");
    }

    #[tokio::test]
    async fn test_invariant_tracking_and_fault_localization() {
        let engine = SyncytiumEngine::new();

        engine.apply_op(CrdtOp {
            op_id: "inv-1".to_string(),
            lamport: 1,
            timestamp_ms: 500,
            agent_id: "guard-1".to_string(),
            role: "consistency_guardian".to_string(),
            kind: CrdtOpKind::CheckInvariant {
                name: "boundary_safety".to_string(),
                passed: false,
                error: Some("Buffer index out of bounds in slice 2".to_string()),
            },
        }).await;

        let snap = engine.snapshot().await;
        assert_eq!(snap.invariants.len(), 1);
        assert!(!snap.invariants[0].passed);
        assert_eq!(snap.invariants[0].failure_reason.as_deref(), Some("Buffer index out of bounds in slice 2"));
    }
}
