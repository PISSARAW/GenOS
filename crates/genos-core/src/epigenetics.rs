use crate::state::AgentState;

/// Evaluates a simple trigger condition against the agent's current state.
/// The condition string should be in the format: "<variable> <operator> <value>"
/// Examples:
/// "consecutive_failures > 3"
/// "working_memory_items > 50"
pub fn evaluate_condition(condition: &str, state: &AgentState) -> bool {
    let parts: Vec<&str> = condition.split_whitespace().collect();
    if parts.len() != 3 {
        return false;
    }
    let variable = parts[0];
    let operator = parts[1];
    let value_str = parts[2];
    
    let actual_value = match variable {
        "consecutive_failures" => count_consecutive_failures(state) as f64,
        "working_memory_items" => state.working_memory.items.len() as f64,
        "step_count" => state.execution.step as f64,
        _ => return false,
    };
    
    let target_value: f64 = match value_str.parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    
    match operator {
        ">" => actual_value > target_value,
        "<" => actual_value < target_value,
        ">=" => actual_value >= target_value,
        "<=" => actual_value <= target_value,
        "==" => (actual_value - target_value).abs() < f64::EPSILON,
        "!=" => (actual_value - target_value).abs() >= f64::EPSILON,
        _ => false,
    }
}

fn count_consecutive_failures(state: &AgentState) -> usize {
    let mut failures = 0;
    for output in state.tool_outputs.iter().rev() {
        if !output.success {
            failures += 1;
        } else {
            break;
        }
    }
    failures
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentState, WorkingMemory, WorkingMemoryItem, ExecutionMetadata, EventCursor};
    use crate::state::ToolOutputRecord;
    use chrono::Utc;
    
    fn mock_state() -> AgentState {
        AgentState {
            genome: crate::state::GenomeRef { genome_id: crate::ids::GenomeId::new(), version: "1".to_string() },
            working_memory: WorkingMemory { items: vec![] },
            semantic_memory: crate::state::SemanticMemory { refs: vec![] },
            episodic_memory: crate::state::EpisodicMemory { refs: vec![] },
            memories: vec![],
            tool_outputs: vec![],
            beliefs: vec![],
            active_goals: vec![],
            world_id: crate::ids::WorldId::new(),
            event_cursor: EventCursor { branch_id: crate::ids::BranchId::new(), sequence: 0, last_event_id: None },
            execution: ExecutionMetadata { step: 0, last_model_provider: None },
            artifact_refs: vec![],
        }
    }

    #[test]
    fn test_working_memory_items() {
        let mut state = mock_state();
        state.working_memory.items.push(WorkingMemoryItem { key: "a".to_string(), value: "1".to_string() });
        state.working_memory.items.push(WorkingMemoryItem { key: "b".to_string(), value: "2".to_string() });
        
        assert!(evaluate_condition("working_memory_items > 1", &state));
        assert!(evaluate_condition("working_memory_items == 2", &state));
        assert!(!evaluate_condition("working_memory_items > 5", &state));
    }
    
    #[test]
    fn test_consecutive_failures() {
        let mut state = mock_state();
        let make_tool = |success: bool| ToolOutputRecord {
            id: crate::ids::ToolOutputId::new(),
            tool_name: "test".to_string(),
            input: serde_json::Value::Null,
            output: serde_json::Value::Null,
            success,
            branch_id: crate::ids::BranchId::new(),
            created_at: Utc::now(),
            generating_event_id: crate::ids::EventId::new(),
        };
        
        state.tool_outputs.push(make_tool(true));
        state.tool_outputs.push(make_tool(false));
        state.tool_outputs.push(make_tool(false));
        
        assert!(evaluate_condition("consecutive_failures == 2", &state));
        assert!(evaluate_condition("consecutive_failures > 1", &state));
        assert!(!evaluate_condition("consecutive_failures > 3", &state));
        
        state.tool_outputs.push(make_tool(true));
        assert!(evaluate_condition("consecutive_failures == 0", &state));
    }
}
