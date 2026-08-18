use serde_json::Value;

use super::types::{
    CausalState, CausalStateEffect, EffectOperation, PredicateOperation, StateChange, StatePredicate,
};

pub(crate) fn predicate_matches(state: &CausalState, predicate: &StatePredicate) -> bool {
    let current = state.get(&predicate.key);
    match predicate.operation {
        PredicateOperation::Exists => current.is_some(),
        PredicateOperation::Missing => current.is_none(),
        PredicateOperation::Equals => current == Some(&predicate.value),
        PredicateOperation::NotEquals => current != Some(&predicate.value),
        PredicateOperation::GreaterThan => compare_numbers(current, &predicate.value, |a, b| a > b),
        PredicateOperation::GreaterOrEqual => {
            compare_numbers(current, &predicate.value, |a, b| a >= b)
        }
        PredicateOperation::LessThan => compare_numbers(current, &predicate.value, |a, b| a < b),
        PredicateOperation::LessOrEqual => {
            compare_numbers(current, &predicate.value, |a, b| a <= b)
        }
    }
}

fn compare_numbers(
    current: Option<&Value>,
    expected: &Value,
    compare: impl FnOnce(f64, f64) -> bool,
) -> bool {
    current
        .and_then(Value::as_f64)
        .zip(expected.as_f64())
        .is_some_and(|(current, expected)| compare(current, expected))
}

pub(crate) fn apply_effect(
    state: &mut CausalState,
    effect: &CausalStateEffect,
) -> Result<StateChange, String> {
    let before = state.get(&effect.key).cloned();
    match effect.operation {
        EffectOperation::Set => {
            state.insert(effect.key.clone(), effect.value.clone());
        }
        EffectOperation::Remove => {
            state.remove(&effect.key);
        }
        EffectOperation::Add | EffectOperation::Multiply => {
            let current = before.as_ref().and_then(Value::as_f64).ok_or_else(|| {
                format!("effect on {} requires existing numeric state", effect.key)
            })?;
            let operand = effect
                .value
                .as_f64()
                .ok_or_else(|| format!("effect on {} requires numeric value", effect.key))?;
            let value = if effect.operation == EffectOperation::Add {
                current + operand
            } else {
                current * operand
            };
            state.insert(effect.key.clone(), Value::from(value));
        }
    }
    Ok(StateChange {
        key: effect.key.clone(),
        before,
        after: state.get(&effect.key).cloned(),
    })
}
