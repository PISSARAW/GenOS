use serde_json::Value;

/// Ordering contract shared with `backend/src/services/trinityMonitorServer.js`.
///
/// Every live payload carries a server-side monotone `seq` plus the
/// `missionId` it belongs to. The TUI must ignore anything older than the
/// last applied message (stale re-delivery) and anything from a foreign
/// mission (cross-mission mixing on `latest` subscriptions).

/// Extract the server sequence number when the payload carries one.
/// Payloads without `seq` predate the contract and are treated as fresh.
pub fn message_seq(value: &Value) -> Option<u64> {
    value.get("seq").and_then(|v| v.as_u64())
}

/// Extract the mission a payload belongs to when present.
pub fn message_mission(value: &Value) -> Option<&str> {
    value.get("missionId").and_then(|v| v.as_str())
}

/// True while the app has not settled on a mission yet: an empty mission or
/// the `latest` placeholder means "adopt the first mission we observe".
pub fn mission_unset(current: &str) -> bool {
    current.is_empty() || current == "latest"
}

/// World statuses the backend quorum may report (`tied`, `expired`) that are
/// terminal: the world will not progress further without operator action.
/// Without this, `refresh_completion` waits forever and the TUI never shows
/// the synthesis dashboard for tied/expired missions.
pub fn is_terminal_world_status(status: &str) -> bool {
    matches!(
        status,
        "COMPLETED"
            | "ERROR"
            | "TERMINATED"
            | "APOPTOSIS"
            | "QUARANTINED"
            | "BLOCKED"
            | "IDLE"
            | "TIED"
            | "EXPIRED"
    )
}

/// Human label for a barrier state that preserves the backend `detail`
/// (e.g. the quorum `no_active_nodes` reason) instead of dropping it.
pub fn barrier_label(status: &str, detail: &str) -> String {
    let normalized = status.to_uppercase();
    if detail.is_empty() {
        normalized
    } else {
        format!("{normalized} — {detail}")
    }
}

pub enum GateAction {
    Accept,
    Adopt(String),
    Reject,
}

/// Decide whether a live payload may mutate state for `current` mission
/// given the last applied sequence number.
pub fn gate_message(current: &str, last_seq: Option<u64>, value: &Value) -> GateAction {
    if let Some(seq) = message_seq(value) {
        if let Some(last) = last_seq {
            if seq < last {
                return GateAction::Reject;
            }
        }
    }
    match message_mission(value) {
        Some(incoming) if incoming == current => GateAction::Accept,
        Some(incoming) if mission_unset(current) => GateAction::Adopt(incoming.to_string()),
        Some(_) => GateAction::Reject,
        None => GateAction::Accept,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(mission: &str, seq: u64) -> Value {
        serde_json::json!({
            "type": "snapshot",
            "missionId": mission,
            "seq": seq,
            "prompt": "p",
            "worlds": [],
            "barrier": { "status": "waiting", "detail": "" }
        })
    }

    #[test]
    fn test_stale_seq_rejected() {
        let value = snapshot("m1", 3);
        assert!(matches!(gate_message("m1", Some(5), &value), GateAction::Reject));
    }

    #[test]
    fn test_equal_seq_accepted_idempotent() {
        let value = snapshot("m1", 5);
        assert!(matches!(gate_message("m1", Some(5), &value), GateAction::Accept));
    }

    #[test]
    fn test_newer_seq_accepted() {
        let value = snapshot("m1", 6);
        assert!(matches!(gate_message("m1", Some(5), &value), GateAction::Accept));
    }

    #[test]
    fn test_foreign_mission_rejected_despite_fresh_seq() {
        let value = snapshot("other", 99);
        assert!(matches!(gate_message("m1", Some(1), &value), GateAction::Reject));
    }

    #[test]
    fn test_unset_mission_adopts_first_message() {
        let value = snapshot("m9", 1);
        match gate_message("latest", None, &value) {
            GateAction::Adopt(mission) => assert_eq!(mission, "m9"),
            _ => panic!("unset mission must adopt the first message"),
        }
    }

    #[test]
    fn test_legacy_payload_without_seq_or_mission_accepted() {
        let value = serde_json::json!({ "type": "barrier", "status": "waiting" });
        assert!(matches!(gate_message("m1", Some(7), &value), GateAction::Accept));
    }

    #[test]
    fn test_tied_and_expired_are_terminal() {
        assert!(is_terminal_world_status("TIED"));
        assert!(is_terminal_world_status("EXPIRED"));
        assert!(is_terminal_world_status("COMPLETED"));
        assert!(!is_terminal_world_status("RUNNING"));
        assert!(!is_terminal_world_status("WAITING"));
    }

    #[test]
    fn test_barrier_label_preserves_no_active_nodes_reason() {
        assert_eq!(barrier_label("expired", "no_active_nodes"), "EXPIRED — no_active_nodes");
        assert_eq!(barrier_label("tied", ""), "TIED");
    }
}
