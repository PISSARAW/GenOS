//! Molecular chaperones (Hsp70/GroEL) mapped to assisted repair of damaged
//! components.
//!
//! Biological rule: *repair before discarding* — a chaperone provides a
//! protected environment where a mis-folded component retries folding using
//! its own surviving fragments, consuming ATP. Only irrecoverable aggregates
//! are handed to the proteasome (GenOS proteostasis / Cleaner). Attempts are
//! strictly budgeted: infinite repair loops are toxic aggregates.

/// A validator describing one slot of a component's canonical shape.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlotValidator {
    /// Fragment must be non-empty after trim.
    NonEmpty,
    /// Fragment must contain the given marker substring.
    ContainsMarker(String),
    /// Fragment must not exceed the given length.
    MaxLen(usize),
}

impl SlotValidator {
    pub fn check(&self, fragment: &str) -> bool {
        match self {
            SlotValidator::NonEmpty => !fragment.trim().is_empty(),
            SlotValidator::ContainsMarker(marker) => fragment.contains(marker.as_str()),
            SlotValidator::MaxLen(max) => fragment.len() <= *max,
        }
    }

    pub fn describe(&self) -> String {
        match self {
            SlotValidator::NonEmpty => "non_empty".into(),
            SlotValidator::ContainsMarker(m) => format!("contains({m})"),
            SlotValidator::MaxLen(n) => format!("max_len({n})"),
        }
    }
}

/// The canonical (well folded) shape of a component: one validator per
/// ordered slot, plus optional reference templates used to refill slots that
/// cannot be recovered from the damaged copy itself.
#[derive(Debug, Clone)]
pub struct CanonicalSchema {
    pub kind: String,
    pub slots: Vec<SlotValidator>,
    /// Optional per-slot reference payloads. `None` means the slot must be
    /// self-repaired from surviving fragments only.
    pub templates: Vec<Option<String>>,
}

impl CanonicalSchema {
    /// Build a schema where every slot is `NonEmpty` and no templates exist.
    pub fn plain(kind: &str, slot_count: usize) -> Self {
        CanonicalSchema {
            kind: kind.to_string(),
            slots: vec![SlotValidator::NonEmpty; slot_count],
            templates: vec![None; slot_count],
        }
    }
}

/// A damaged component awaiting diagnosis.
#[derive(Debug, Clone)]
pub struct DamagedComponent {
    pub id: String,
    pub kind: String,
    /// Ordered fragments; an empty fragment models a mis-folded slot.
    pub fragments: Vec<String>,
}

/// Result of [`Chaperone::diagnose`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Diagnosis {
    /// Component already satisfies its canonical schema.
    Healthy,
    /// Mis-folded slots identified by index; repair is worth attempting.
    Recoverable { damaged_slots: Vec<usize> },
    /// Too much structure is lost for refolding; route to proteolysis.
    Irrecoverable { reason: String },
}

/// Outcome of [`Chaperone::repair`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepairOutcome {
    /// Refolded component (ordered repaired fragments).
    Repaired(Vec<String>),
    /// Attempt budget exhausted or no path to a valid fold: explicit handover
    /// to the proteostasis layer with justification.
    RecommendProteolysis { reason: String },
}

/// The chaperone machine itself: bounded attempts, per-attempt ATP cost.
#[derive(Debug, Clone)]
pub struct Chaperone {
    pub max_attempts: usize,
    pub atp_per_attempt: u64,
    pub atp_budget: u64,
}

impl Default for Chaperone {
    fn default() -> Self {
        Chaperone {
            max_attempts: 3,
            atp_per_attempt: 1,
            atp_budget: 5,
        }
    }
}

impl Chaperone {
    pub fn new(max_attempts: usize, atp_budget: u64) -> Self {
        Chaperone {
            max_attempts,
            atp_per_attempt: 1,
            atp_budget,
        }
    }

    fn misfolded_slots(component: &DamagedComponent, schema: &CanonicalSchema) -> Vec<usize> {
        component
            .fragments
            .iter()
            .enumerate()
            .filter(|(i, fragment)| {
                schema
                    .slots
                    .get(*i)
                    .map(|validator| !validator.check(fragment))
                    .unwrap_or(true)
            })
            .map(|(i, _)| i)
            .collect()
    }

    /// Classify the damage before spending any ATP.
    ///
    /// A component is irrecoverable when more than half of its slots are
    /// mis-folded without templates available for them: below that threshold
    /// the surviving majority can still anchor a valid refold, above it the
    /// "repair" would be fabrication.
    pub fn diagnose(&self, component: &DamagedComponent, schema: &CanonicalSchema) -> Diagnosis {
        if component.fragments.len() != schema.slots.len() {
            return Diagnosis::Irrecoverable {
                reason: format!(
                    "structural mismatch: {} fragments vs {} schema slots",
                    component.fragments.len(),
                    schema.slots.len()
                ),
            };
        }
        let damaged = Self::misfolded_slots(component, schema);
        if damaged.is_empty() {
            return Diagnosis::Healthy;
        }
        let templated = damaged
            .iter()
            .filter(|&&i| matches!(schema.templates.get(i), Some(Some(_))))
            .count();
        let untemplated_damage = damaged.len() - templated;
        if untemplated_damage * 2 > schema.slots.len() {
            return Diagnosis::Irrecoverable {
                reason: format!(
                    "{untemplated_damage} untemplated mis-folded slots out of {} exceed the refolding threshold",
                    schema.slots.len()
                ),
            };
        }
        Diagnosis::Recoverable {
            damaged_slots: damaged,
        }
    }

    /// Attempt an ATP-bounded refold inside the protected environment.
    ///
    /// Each attempt re-uses every surviving fragment as-is and refills only
    /// the mis-folded slots from canonical templates. If the template itself
    /// fails its own validator the attempt is wasted (biological reality:
    /// chaperoning can fail), and the loop stops when attempts or ATP run out.
    pub fn repair(
        &mut self,
        component: &DamagedComponent,
        schema: &CanonicalSchema,
    ) -> RepairOutcome {
        match self.diagnose(component, schema) {
            Diagnosis::Healthy => RepairOutcome::Repaired(component.fragments.clone()),
            Diagnosis::Irrecoverable { reason } => RepairOutcome::RecommendProteolysis { reason },
            Diagnosis::Recoverable { damaged_slots } => {
                let needed = self
                    .atp_per_attempt
                    .saturating_mul(self.max_attempts as u64);
                if needed > self.atp_budget {
                    return RepairOutcome::RecommendProteolysis {
                        reason: format!(
                            "refolding needs {needed} ATP but budget is {}",
                            self.atp_budget
                        ),
                    };
                }
                let mut folded = component.fragments.clone();
                let mut attempts_used = 0usize;
                for &slot in &damaged_slots {
                    let template = match schema.templates.get(slot) {
                        Some(Some(payload)) => payload.clone(),
                        _ => continue,
                    };
                    if attempts_used >= self.max_attempts {
                        break;
                    }
                    attempts_used += 1;
                    self.atp_budget -= self.atp_per_attempt;
                    if schema.slots[slot].check(&template) {
                        folded[slot] = template;
                    }
                }
                let remaining = Self::misfolded_slots(
                    &DamagedComponent {
                        id: component.id.clone(),
                        kind: component.kind.clone(),
                        fragments: folded.clone(),
                    },
                    schema,
                );
                if remaining.is_empty() {
                    RepairOutcome::Repaired(folded)
                } else {
                    RepairOutcome::RecommendProteolysis {
                        reason: format!(
                            "{remaining:?} still mis-folded after {attempts_used} chaperoned attempts"
                        ),
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema_with_templates() -> CanonicalSchema {
        CanonicalSchema {
            kind: "memory_index".into(),
            slots: vec![
                SlotValidator::NonEmpty,
                SlotValidator::ContainsMarker("idx:".into()),
                SlotValidator::NonEmpty,
            ],
            templates: vec![None, Some("idx:42".into()), None],
        }
    }

    #[test]
    fn healthy_component_is_not_touched() {
        let mut chaperone = Chaperone::default();
        let component = DamagedComponent {
            id: "c1".into(),
            kind: "memory_index".into(),
            fragments: vec!["alpha".into(), "idx:7".into(), "gamma".into()],
        };
        assert_eq!(
            chaperone.diagnose(&component, &schema_with_templates()),
            Diagnosis::Healthy
        );
        assert_eq!(
            chaperone.repair(&component, &schema_with_templates()),
            RepairOutcome::Repaired(vec!["alpha".into(), "idx:7".into(), "gamma".into()])
        );
    }

    #[test]
    fn recoverable_slot_is_refilled_from_template() {
        let mut chaperone = Chaperone::default();
        let component = DamagedComponent {
            id: "c2".into(),
            kind: "memory_index".into(),
            fragments: vec!["alpha".into(), String::new(), "gamma".into()],
        };
        match chaperone.diagnose(&component, &schema_with_templates()) {
            Diagnosis::Recoverable { damaged_slots } => assert_eq!(damaged_slots, vec![1]),
            other => panic!("expected recoverable, got {other:?}"),
        }
        let outcome = chaperone.repair(&component, &schema_with_templates());
        assert_eq!(
            outcome,
            RepairOutcome::Repaired(vec!["alpha".into(), "idx:42".into(), "gamma".into()])
        );
    }

    #[test]
    fn structural_mismatch_is_irrecoverable() {
        let mut chaperone = Chaperone::default();
        let component = DamagedComponent {
            id: "c3".into(),
            kind: "memory_index".into(),
            fragments: vec!["only-one".into()],
        };
        assert!(matches!(
            chaperone.diagnose(&component, &schema_with_templates()),
            Diagnosis::Irrecoverable { .. }
        ));
    }

    #[test]
    fn untemplated_majority_damage_routes_to_proteolysis() {
        let schema = CanonicalSchema::plain("blob", 4);
        let mut chaperone = Chaperone::default();
        let component = DamagedComponent {
            id: "c4".into(),
            kind: "blob".into(),
            fragments: vec![String::new(), String::new(), String::new(), "ok".into()],
        };
        let outcome = chaperone.repair(&component, &schema);
        assert_eq!(
            outcome,
            RepairOutcome::RecommendProteolysis {
                reason: "3 untemplated mis-folded slots out of 4 exceed the refolding threshold"
                    .into()
            }
        );
    }

    #[test]
    fn attempt_budget_is_respected() {
        // Needs 3 attempts x 1 ATP but only 2 ATP available.
        let mut chaperone = Chaperone::new(3, 2);
        let component = DamagedComponent {
            id: "c5".into(),
            kind: "memory_index".into(),
            fragments: vec!["a".into(), String::new(), "c".into()],
        };
        let outcome = chaperone.repair(&component, &schema_with_templates());
        assert!(matches!(
            outcome,
            RepairOutcome::RecommendProteolysis { .. }
        ));
    }
}
