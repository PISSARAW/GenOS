use super::*;

#[test]
fn live_worlds_follow_snapshot_membership_and_unknown_metrics() {
    let mut app = TrinityApp::new_live("m1");
    assert!(app.worlds.is_empty());
    assert_eq!(app.barrier_status, "UNKNOWN");
    app.apply_live_message(&serde_json::json!({ "type": "snapshot", "missionId": "m1",
        "worlds": [{ "worldNumber": 2, "name": "actual", "status": "running", "progress": 999, "progressKnown": false }] }));
    assert_eq!(app.worlds.len(), 1);
    assert_eq!(app.worlds[0].id, 2);
    assert_eq!(app.worlds[0].progress, 100);
    assert!(!app.worlds[0].progress_known);
    assert!(!app.worlds[0].tokens_known);
    assert!(app.worlds[0].hypothesis.is_empty());
    app.focus_world(1);
    assert_eq!(app.focused_world, None);
    app.apply_live_message(&serde_json::json!({ "type": "snapshot", "missionId": "m1", "worlds": [] }));
    assert!(app.worlds.is_empty());
    assert!(!app.completed);
}

    #[test]
    fn test_trinity_app_initialization() {
        let app = TrinityApp::new("mission-test", "Test prompt");
        assert_eq!(app.worlds.len(), 3);
        assert_eq!(app.worlds[0].id, 1);
        assert_eq!(app.worlds[1].id, 2);
        assert_eq!(app.worlds[2].id, 3);
        assert_eq!(app.mission_id, "mission-test");
        assert_eq!(app.prompt, "Test prompt");
        assert_eq!(app.focused_world, None);
        assert!(!app.show_dashboard);
    }

    #[test]
    fn test_trinity_app_progression_and_synthesis() {
        let mut app = TrinityApp::new("mission-test", "Bencode parser");
        for _ in 0..12 {
            app.tick();
        }
        assert!(app.completed);
        assert_eq!(app.worlds[0].status, "FINISHED");
        assert_eq!(app.worlds[1].status, "FINISHED");
        assert_eq!(app.worlds[2].status, "FINISHED");
        assert_eq!(app.worlds[0].verdict, "REJECTED (INCOMPLETE)");
        assert_eq!(app.worlds[1].verdict, "COMPATIBLE");
        assert_eq!(app.worlds[2].verdict, "WINNER (PROMOTED)");
        assert!(app.worlds[2].evidence_score > app.worlds[0].evidence_score);
    }

    #[test]
    fn test_trinity_app_controls() {
        let mut app = TrinityApp::new("m1", "p1");
        app.toggle_dashboard();
        assert!(app.show_dashboard);
        app.focus_world(2);
        assert_eq!(app.focused_world, Some(2));
        app.restart();
        assert_eq!(app.step, 0);
        assert_eq!(app.worlds[0].progress, 0);
    }

    #[test]
    fn test_live_snapshot_and_log_and_barrier() {
        let mut app = TrinityApp::new_live("trinity_123");
        assert!(app.live);
        assert!(!app.connected);

        let snapshot = serde_json::json!({
            "type": "snapshot",
            "missionId": "trinity_123",
            "prompt": "Implement a parser",
            "worlds": [
                { "worldNumber": 1, "name": "Naive", "strategy": "basic_implementation", "hypothesis": "raw need", "modelTier": "Standard", "status": "running", "progress": 40, "evidenceScore": 0.0, "verdict": "PENDING" },
                { "worldNumber": 2, "name": "Planned", "strategy": "planned_implementation", "hypothesis": "spec-driven", "modelTier": "Pro", "status": "completed", "progress": 100, "evidenceScore": 0.9, "verdict": "STRONG" },
                { "worldNumber": 3, "name": "Self-correcting", "strategy": "self_correcting", "hypothesis": "adversarial", "modelTier": "Pro", "status": "running", "progress": 60, "evidenceScore": 0.0, "verdict": "PENDING" }
            ],
            "barrier": { "status": "waiting", "detail": "Waiting for 2 workers" }
        });
        app.apply_live_message(&snapshot);
        assert_eq!(app.mission_id, "trinity_123");
        assert_eq!(app.worlds[1].status, "COMPLETED");
        assert_eq!(app.barrier_status, "WAITING");
        assert!(!app.completed);

        let log = serde_json::json!({ "type": "log", "missionId": "trinity_123", "worldNumber": 1, "line": "[10:00:00] running step" });
        app.apply_live_message(&log);
        assert_eq!(app.worlds[0].logs.last().unwrap(), "[10:00:00] running step");

        let barrier = serde_json::json!({ "type": "barrier", "missionId": "trinity_123", "status": "satisfied", "detail": "All workers terminal" });
        app.apply_live_message(&barrier);
        assert_eq!(app.barrier_status, "SATISFIED");
    }

    #[test]
    fn test_live_stale_and_foreign_messages_ignored() {
        let mut app = TrinityApp::new_live("latest");
        let first = serde_json::json!({
            "type": "snapshot", "missionId": "m1", "seq": 10, "prompt": "fresh",
            "worlds": [], "barrier": { "status": "waiting", "detail": "" }
        });
        app.apply_live_message(&first);
        assert_eq!(app.mission_id, "m1");

        let stale = serde_json::json!({
            "type": "snapshot", "missionId": "m1", "seq": 9, "prompt": "stale",
            "worlds": [], "barrier": { "status": "waiting", "detail": "" }
        });
        app.apply_live_message(&stale);
        assert_eq!(app.prompt, "fresh");

        let foreign = serde_json::json!({ "type": "barrier", "missionId": "m2", "seq": 11, "status": "satisfied", "detail": "x" });
        app.apply_live_message(&foreign);
        assert_eq!(app.barrier_status, "WAITING");
    }

    #[test]
    fn test_tied_and_expired_worlds_complete_with_label() {
        let mut app = TrinityApp::new_live("m1");
        let snapshot = serde_json::json!({
            "type": "snapshot", "missionId": "m1", "prompt": "p",
            "worlds": [
                { "worldNumber": 1, "name": "A", "status": "tied", "progress": 100, "evidenceScore": 0.5, "verdict": "PENDING" },
                { "worldNumber": 2, "name": "B", "status": "expired", "progress": 100, "evidenceScore": 0.4, "verdict": "PENDING" },
                { "worldNumber": 3, "name": "C", "status": "completed", "progress": 100, "evidenceScore": 0.9, "verdict": "STRONG" }
            ],
            "barrier": { "status": "expired", "detail": "no_active_nodes" }
        });
        app.apply_live_message(&snapshot);
        assert_eq!(app.worlds[0].status, "TIED");
        assert_eq!(app.worlds[1].status, "EXPIRED");
        assert!(app.completed);
        assert!(app.show_dashboard);
        assert_eq!(app.barrier_status, "EXPIRED");
        assert_eq!(app.barrier_label, "EXPIRED — no_active_nodes");
    }
