use super::{InstinctActionTrace, InstinctActivation, InstinctMissionReceipt};
use genos_biology::instinct::{MotorStep, StimulusField};
use serde_json::Value;
use uuid::Uuid;

pub(super) struct MissionReceiptContext<'a> {
    pub mission_id: Option<Uuid>,
    pub tick: u64,
    pub field: &'a StimulusField,
}

pub(super) struct ActionTraceInput<'a> {
    pub step_index: usize,
    pub step: &'a MotorStep,
    pub succeeded: bool,
    pub result: Value,
}

pub(super) fn action_trace(input: ActionTraceInput<'_>) -> InstinctActionTrace {
    InstinctActionTrace {
        step: input.step_index,
        tool: input.step.tool.clone(),
        action: input.step.action.clone(),
        succeeded: input.succeeded,
        result: input.result,
    }
}

pub(super) fn mission_receipts(
    context: MissionReceiptContext<'_>,
    activations: &[InstinctActivation],
) -> Vec<InstinctMissionReceipt> {
    let Some(mission_id) = context.mission_id else {
        return Vec::new();
    };
    activations
        .iter()
        .map(|activation| InstinctMissionReceipt {
            schema: "genos.instinct-paf-receipt/v1".into(),
            receipt_id: Uuid::new_v4(),
            mission_id,
            tick: context.tick,
            locus: activation.locus.clone(),
            stimuli: context.field.readings.clone(),
            evaluation: activation.evaluation.clone(),
            outcome: activation.outcome.clone(),
            actions: activation.actions.clone(),
        })
        .collect()
}
