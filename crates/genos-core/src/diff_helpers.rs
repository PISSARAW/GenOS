//! Private helpers for the structural diff engine.
//!
//! These are implementation details of [`super::diff_snapshots`] and should not
//! be used directly outside the `diff` module.

use super::DiffEntry;
use crate::snapshot::AgentSnapshot;
use serde::Serialize;
use serde_json::{Map, Number, Value};
use std::fmt::Write;

/// One pair of values to walk, with the field that stands for a whole record
/// when that record appears on one side only.
pub(super) struct Root {
    pub(super) path: String,
    pub(super) a: Value,
    pub(super) b: Value,
    pub(super) summary_field: Option<&'static str>,
}

impl Root {
    pub(super) fn new(path: &str, a: Value, b: Value) -> Self {
        Root {
            path: path.to_string(),
            a,
            b,
            summary_field: None,
        }
    }

    /// A root whose records are summarized by `field` when they appear on
    /// one side only: a memory added on one branch reports its content, not the
    /// whole record.
    pub(super) fn with_summary(mut self, field: &'static str) -> Self {
        self.summary_field = Some(field);
        self
    }
}

/// Accumulator passed through the recursive diff walk.
pub(super) struct DiffContext<'a> {
    pub(super) summary_field: Option<&'static str>,
    pub(super) out: &'a mut Vec<DiffEntry>,
}

pub(super) fn diff_roots(roots: &[Root]) -> Vec<DiffEntry> {
    let mut out = Vec::new();
    for root in roots {
        let mut ctx = DiffContext {
            summary_field: root.summary_field,
            out: &mut out,
        };
        diff_values(&root.path, &root.a, &root.b, &mut ctx);
    }
    out
}

/// Walk two values in parallel, emitting one entry per differing leaf — except
/// for a record present on one side only, which is one change, not one change
/// per field it happens to carry.
fn diff_values(path: &str, a: &Value, b: &Value, ctx: &mut DiffContext<'_>) {
    if a == b {
        return;
    }

    match (a, b) {
        (Value::Object(map_a), Value::Object(map_b)) => {
            // serde_json maps are ordered, so the report is deterministic.
            let mut keys: Vec<&String> = map_a.keys().chain(map_b.keys()).collect();
            keys.sort();
            keys.dedup();
            for key in keys {
                diff_values(
                    &format!("{path}.{key}"),
                    map_a.get(key).unwrap_or(&Value::Null),
                    map_b.get(key).unwrap_or(&Value::Null),
                    ctx,
                );
            }
        }
        (Value::Array(items_a), Value::Array(items_b)) => {
            for index in 0..items_a.len().max(items_b.len()) {
                diff_values(
                    &format!("{path}[{index}]"),
                    items_a.get(index).unwrap_or(&Value::Null),
                    items_b.get(index).unwrap_or(&Value::Null),
                    ctx,
                );
            }
        }
        _ => ctx.out.push(DiffEntry {
            path: path.to_string(),
            before: summarize(a, ctx.summary_field),
            after: summarize(b, ctx.summary_field),
            provenance: provenance_of(a).or_else(|| provenance_of(b)),
        }),
    }
}

/// Render a value for a diff entry: a record standing on its own is reduced to
/// its summary field when the root declared one, and to compact JSON otherwise.
fn summarize(value: &Value, summary_field: Option<&str>) -> Option<String> {
    match (value, summary_field) {
        (Value::Object(map), Some(field)) => match map.get(field) {
            Some(summary) => render(summary),
            None => render(value),
        },
        _ => render(value),
    }
}

/// Provenance of a record that carries it: which branch created it, when, and
/// on what basis. Records without `created_in` have none to report.
fn provenance_of(value: &Value) -> Option<String> {
    let map = value.as_object()?;
    let created_in = map.get("created_in").and_then(Value::as_str)?;

    let mut provenance = format!("created in branch {created_in}");
    if let Some(created_at) = map.get("created_at").and_then(Value::as_str) {
        let _ = write!(provenance, " at {created_at}");
    }
    if let Some(source) = map.get("source").and_then(Value::as_str) {
        let _ = write!(provenance, ", source={source}");
    }

    Some(provenance)
}

/// `None` means "no value on this side": either absent, or explicitly null.
fn render(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(render_number(number)),
        other => Some(other.to_string()),
    }
}

/// Report a number the way the field holds it.
///
/// Serialization widens `f32` to `f64`, which turns an `exploration` of `0.7`
/// into `0.699999988079071`. When the widened value round-trips through `f32`
/// exactly, the narrow form is the one the field actually carries, so that is
/// what the diff shows. Integers and genuine `f64` values are untouched.
fn render_number(number: &Number) -> String {
    match number.as_f64() {
        Some(wide)
            if number.is_f64() && wide.is_finite() && f64::from(wide as f32) == wide =>
        {
            (wide as f32).to_string()
        }
        _ => number.to_string(),
    }
}

pub(super) fn json_of<T: Serialize>(value: &T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

/// Turn `[{ "<key_field>": k, ... }, ...]` into `{ k: { ... } }` so a collection
/// that behaves like a map diffs by identity instead of by position. Entries
/// without a usable key keep their index, and a duplicated key keeps the last
/// entry — the same rule the rest of the model applies to duplicates.
pub(super) fn keyed_by(value: Value, key_field: &str) -> Value {
    let Value::Array(items) = value else {
        return value;
    };

    let mut map = Map::new();
    for (index, item) in items.into_iter().enumerate() {
        let key = item
            .get(key_field)
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("[{index}]"));
        map.insert(key, item);
    }
    Value::Object(map)
}

/// [`keyed_by`], keeping only `value_field` as the mapped value: working memory
/// diffs as `{ counter: "10" }` rather than as a list of key/value records.
pub(super) fn keyed_values(value: Value, key_field: &str, value_field: &str) -> Value {
    let Value::Object(map) = keyed_by(value, key_field) else {
        return Value::Object(Map::new());
    };

    Value::Object(
        map.into_iter()
            .map(|(key, item)| {
                let mapped = item.get(value_field).cloned().unwrap_or(item);
                (key, mapped)
            })
            .collect(),
    )
}

/// Compare reference lists as sets by keying each element on itself.
///
/// Reordering a list is then not a change, and adding one reference is one
/// entry rather than a positional cascade through everything after it.
pub(super) fn keyed_set(value: Value) -> Value {
    let Value::Array(items) = value else {
        return value;
    };

    Value::Object(
        items
            .into_iter()
            .map(|item| {
                let key = match &item {
                    Value::String(text) => text.clone(),
                    other => other.to_string(),
                };
                (key, item)
            })
            .collect(),
    )
}

/// Replace the value at `path` inside `value` by `f(value_at_path)`.
pub(super) fn normalize_at(value: &mut Value, path: &[&str], f: impl FnOnce(Value) -> Value) {
    let Some((last, parents)) = path.split_last() else {
        return;
    };

    let mut cursor = value;
    for key in parents {
        match cursor.get_mut(*key) {
            Some(next) => cursor = next,
            None => return,
        }
    }

    if let Some(target) = cursor.get_mut(*last) {
        *target = f(target.take());
    }
}

/// Genome, with its keyed collections normalized.
pub(super) fn genome_value(snapshot: &AgentSnapshot) -> Value {
    let mut value = json_of(&snapshot.genome);
    normalize_at(&mut value, &["objectives"], |v| keyed_by(v, "key"));
    normalize_at(&mut value, &["policies"], |v| keyed_by(v, "key"));
    normalize_at(&mut value, &["capabilities"], |v| keyed_by(v, "name"));
    normalize_at(&mut value, &["tool_policy", "permissions"], |v| {
        keyed_by(v, "tool")
    });
    value
}
