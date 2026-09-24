//! Tests du runtime worker commun.

#[cfg(test)]
mod worker_tests {
    use crate::contract::validate_contract;
    use crate::cycle::{CycleOutcome, ReviewDecision, WorkerState, advance, review};
    use crate::cycle::{record_cognitive_change, record_strategy_change};
    use crate::dossier::{VerificationReport, WorkerDossier};
    use crate::invariants::{ActionRequest, check_action};
    use crate::phenotype::{WorkerFamily, WorkerKind, dedifferentiate, default_phenotype};
    use crate::phenotype::family_of;
    use crate::phenotype::niche_fit;
    use crate::dossier::WorkerStatus;
    use crate::presets::{PresetInput, preset_for};

    fn input() -> PresetInput {
        PresetInput::new("w1", "Diagnostiquer X", "module-auth").with_parent("parent")
    }

    #[test]
    fn all_kinds_have_valid_contract_shape() {
        for kind in WorkerKind::all() {
            let c = preset_for(kind, &input());
            assert_eq!(c.identity.phenotype, kind.name());
            assert!(!c.evidence.required_artifacts.is_empty());
            assert!(validate_contract(&c).is_empty(), "invalid preset: {}", kind.name());
        }
    }

    #[test]
    fn each_kind_declares_its_expected_artifact() {
        use WorkerKind::*;
        let expected = [
            (ScoutCell, "scout_observation"),
            (ResidentDaemon, "dossier"),
            (BoundedWorker, "dossier"),
            (AdaptiveWorker, "dossier"),
            (Specialist, "dossier"),
            (ProceduralExecutor, "dossier"),
            (SymbioticWorker, "dossier"),
            (VerifierWorker, "verification_report"),
            (RedWorker, "verification_report"),
            (ExperimentalWorker, "experiment_record"),
            (FormalWorker, "formal_certificate"),
            (SynthesisWorker, "synthesis_dossier"),
            (CreativeWorker, "creative_candidate"),
            (MedicalWorker, "clinical_report"),
            (RecoveryWorker, "dossier"),
            (ForensicWorker, "causal_dossier"),
            (LiaisonWorker, "dossier"),
            (TeachingWorker, "training_packet"),
            (SubOrchestrator, "dossier"),
        ];
        for (kind, artifact) in expected {
            assert_eq!(preset_for(kind, &input()).evidence.required_artifacts, [artifact]);
        }
    }

    #[test]
    fn scout_is_read_only_ephemeral() {
        let c = preset_for(WorkerKind::ScoutCell, &input());
        assert!(c.authority.read);
        assert!(!c.authority.write);
        assert!(!c.authority.spawn);
        assert_eq!(c.lifecycle.max_iterations, Some(1));
    }

    #[test]
    fn suborchestrator_can_spawn_bounded_can_not() {
        let sub = preset_for(WorkerKind::SubOrchestrator, &input());
        assert!(sub.authority.spawn);
        assert_eq!(sub.spawn_budget, 5);
        assert_eq!(sub.delegation_depth, 1);
        let bounded = preset_for(WorkerKind::BoundedWorker, &input());
        assert!(!bounded.authority.spawn);
        assert_eq!(bounded.spawn_budget, 0);
        assert_eq!(bounded.delegation_depth, 0);
    }

    #[test]
    fn worker_presets_cannot_promote() {
        for kind in WorkerKind::all() {
            let c = preset_for(kind, &input());
            assert!(!c.authority.promote, "{} can promote", kind.name());
            let action = ActionRequest {
                kind: "promote".to_string(),
                wants_promotion: true,
                has_receipt: true,
                ..Default::default()
            };
            assert!(check_action(&c, &action).iter().any(|v| v.rule == 4));
        }
    }

    #[test]
    fn suborchestrator_spawn_and_delegation_are_capped() {
        let c = preset_for(WorkerKind::SubOrchestrator, &input());
        let spawn = ActionRequest {
            kind: "spawn".to_string(),
            uses_lease: true,
            tool: Some("spawn_capped".to_string()),
            wants_spawn: true,
            has_receipt: true,
            ..Default::default()
        };
        assert!(check_action(&c, &spawn).is_empty());
        let no_lease = ActionRequest { uses_lease: false, ..spawn.clone() };
        assert!(check_action(&c, &no_lease).iter().any(|v| v.rule == 2));
        let exhausted = ActionRequest { active_spawn_count: 5, ..spawn.clone() };
        assert!(check_action(&c, &exhausted).iter().any(|v| v.message.contains("budget")));
        let too_deep = ActionRequest {
            kind: "delegate".to_string(),
            uses_lease: true,
            tool: Some("spawn_capped".to_string()),
            wants_delegate: true,
            requested_delegation_depth: 2,
            has_receipt: true,
            ..Default::default()
        };
        assert!(check_action(&c, &too_deep).iter().any(|v| v.message.contains("profondeur")));
    }

    #[test]
    fn older_serialized_authority_defaults_to_no_promotion() {
        let authority: crate::contract::AuthorityProfile = serde_json::from_str(
            r#"{"read":true,"execute":false,"write":false,"delegate":false,"spawn":false,"topology_change":false,"genome_change":false}"#,
        ).unwrap();
        assert!(!authority.promote);
    }

    #[test]
    fn procedural_uses_zero_tokens() {
        let c = preset_for(WorkerKind::ProceduralExecutor, &input());
        assert_eq!(c.resources.tokens, 0);
    }

    #[test]
    fn families_cover_all_kinds() {
        use WorkerKind::*;
        assert_eq!(family_of(WorkerKind::ScoutCell), WorkerFamily::Sensory);
        assert_eq!(family_of(BoundedWorker), WorkerFamily::Execution);
        assert_eq!(family_of(WorkerKind::VerifierWorker), WorkerFamily::Epistemic);
        assert_eq!(family_of(CreativeWorker), WorkerFamily::AdaptiveRepair);
        assert_eq!(family_of(SubOrchestrator), WorkerFamily::Organizational);
        let _ = WorkerStatus::Completed;
    }

    #[test]
    fn invariants_reject_self_promotion() {
        let c = preset_for(WorkerKind::BoundedWorker, &input());
        let action = ActionRequest {
            kind: "execute".to_string(),
            uses_lease: true,
            tool: Some("unknown_tool".to_string()),
            wants_authority_gain: true,
            scope: c.mission.scope.clone(),
            has_receipt: true,
            ..Default::default()
        };
        let violations = check_action(&c, &action);
        assert!(violations.iter().any(|v| v.rule == 1));
        assert!(violations.iter().any(|v| v.rule == 2));
    }

    #[test]
    fn invariants_reject_unauthorized_spawn() {
        let c = preset_for(WorkerKind::BoundedWorker, &input());
        let action = ActionRequest {
            kind: "spawn".to_string(),
            wants_spawn: true,
            scope: c.mission.scope.clone(),
            has_receipt: true,
            ..Default::default()
        };
        assert!(check_action(&c, &action).iter().any(|v| v.rule == 8));
    }

    #[test]
    fn strategy_changes_are_bounded() {
        let mut s = WorkerState {
            max_strategy_changes: 1,
            max_cognitive_changes: 0,
            ..Default::default()
        };
        assert!(record_strategy_change(&mut s, "causal_bisection"));
        assert!(!record_strategy_change(&mut s, "trinity"));
        assert!(!record_cognitive_change(&mut s, "x"));
        let mut s2 = WorkerState::default();
        assert!(record_cognitive_change(&mut s2, "r"));
        let _ = s2;
    }

    #[test]
    fn review_routes_to_outcomes() {
        let mut s = WorkerState::default();
        let done = review(&mut s, &ReviewDecision {
            success: true,
            ..Default::default()
        });
        assert_eq!(done, CycleOutcome::Terminate);
        let mut s2 = WorkerState::default();
        let esc = review(&mut s2, &ReviewDecision {
            need_parent: true,
            ..Default::default()
        });
        assert_eq!(esc, CycleOutcome::Escalate);
        let mut s3 = WorkerState::default();
        advance(&mut s3);
        assert_ne!(s3.step, crate::cycle::CycleStep::Incarnate);
    }

    #[test]
    fn dossier_success_requires_evidence() {
        let d = WorkerDossier {
            status: "completed".to_string(),
            ..Default::default()
        };
        assert!(!d.is_verified_success());
        let report = VerificationReport::unresolved("claim");
        assert_eq!(report.verdict, crate::dossier::VerificationVerdict::Unresolved);
    }

    #[test]
    fn phenotype_niche_fit_and_dediff() {
        let mut p = default_phenotype(WorkerKind::Specialist);
        p.specialization = Some("rust_concurrency".to_string());
        assert!((niche_fit(&p, "rust_concurrency") - 1.0).abs() < 1e-9);
        assert!(niche_fit(&p, "frontend") < 0.5);
        let plastic = dedifferentiate(&p);
        assert!(plastic.specialization.is_none());
    }

    #[test]
    fn contracts_validate_objective_and_scope() {
        let mut c = preset_for(WorkerKind::BoundedWorker, &input());
        assert!(validate_contract(&c).is_empty());
        c.mission.objective.clear();
        assert!(!validate_contract(&c).is_empty());
    }
}
