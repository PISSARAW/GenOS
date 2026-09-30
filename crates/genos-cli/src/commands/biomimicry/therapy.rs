use serde_json::json;

pub(super) fn unavailable(agent_id: &str, therapy_type: &str) -> serde_json::Value {
    json!({
        "success": false,
        "operation": "therapy",
        "agent_id": agent_id,
        "therapy_type": therapy_type,
        "status": "not_executed",
        "treatment_administered": false,
        "reason": "persistent clinical state and a wired therapy executor are required"
    })
}

#[cfg(test)]
mod tests {
    use super::unavailable;

    #[test]
    fn it_does_not_claim_an_unexecuted_treatment_succeeded() {
        let result = unavailable("agent-1", "ChelationTherapy");
        assert_eq!(result["success"], false);
        assert_eq!(result["status"], "not_executed");
        assert_eq!(result["treatment_administered"], false);
    }
}
