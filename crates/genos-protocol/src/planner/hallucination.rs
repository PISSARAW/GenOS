use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_hallucination(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "hallucination_detect" => {
            planner.args = vec!["hallucination".into(), "detect".into()];
            Ok(true)
        }
        "hallucination_inject" => {
            planner.args = vec!["hallucination".into(), "inject".into()];
            Ok(true)
        }
        "hallucination_test" => {
            planner.args = vec!["hallucination".into(), "test".into()];
            Ok(true)
        }
        "hallucination_extract" => {
            planner.args = vec!["hallucination".into(), "extract".into()];
            Ok(true)
        }
        "hallucination_analyze" => {
            planner.args = vec!["hallucination".into(), "analyze".into()];
            Ok(true)
        }
        "hallucination_correct" => {
            planner.args = vec!["hallucination".into(), "correct".into()];
            Ok(true)
        }
        "hallucination_simulate" => {
            planner.args = vec!["hallucination".into(), "simulate".into()];
            Ok(true)
        }
        _ => Ok(false),
    }
}
