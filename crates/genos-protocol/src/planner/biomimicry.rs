use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;
use serde_json::Value;

pub fn plan_biomimicry(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "biomimicry_swarm_consensus" => {
            planner.args = vec!["biomimicry".into(), "swarm-consensus".into()];
            planner.args.push("--target".into());
            planner.args.push(planner.req_str("target")?.into());
        }
        "biomimicry_flocking_explore" => {
            planner.args = vec!["biomimicry".into(), "flocking-explore".into()];
            planner.args.push("--area".into());
            planner.args.push(planner.req_str("area")?.into());
        }
        "biomimicry_network_quorum" => {
            planner.args = vec!["biomimicry".into(), "network-quorum".into()];
            planner.args.push("--node".into());
            planner.args.push(planner.req_str("node")?.into());
        }
        "biomimicry_distributed_huddle" => {
            planner.args = vec!["biomimicry".into(), "distributed-huddle".into()];
            planner.args.push("--state-file".into());
            planner.args.push(planner.req_str("state_file")?.into());
        }
        "biomimicry_inject_pheromone" => {
            planner.args = vec!["biomimicry".into(), "inject-pheromone".into()];
            planner.args.push("--node".into());
            planner.args.push(planner.req_str("node")?.into());
            planner.args.push("--type".into());
            planner.args.push(planner.req_str("pheromone_type")?.into());
            planner.args.push("--amount".into());
            planner.args.push(planner.req_str("amount")?.into());
        }
        "biomimicry_genetic_sos" => {
            planner.args = vec!["biomimicry".into(), "genetic-sos".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--stress-level".into());
            planner.args.push(planner.req_str("stress_level")?.into());
        }
        "biomimicry_alter_plasmid" => {
            planner.args = vec!["biomimicry".into(), "alter-plasmid".into()];
            planner.args.push("--plasmid-id".into());
            planner.args.push(planner.req_str("plasmid_id")?.into());
            planner.args.push("--payload".into());
            planner.args.push(planner.req_str("payload")?.into());
        }
        "biomimicry_brier_consensus" => {
            planner.args = vec!["biomimicry".into(), "brier-consensus".into()];
            planner.args.push("--topic".into());
            planner.args.push(planner.req_str("topic")?.into());
        }
        "biomimicry_alter_huddle" => {
            planner.args = vec!["biomimicry".into(), "alter-huddle".into()];
            planner.args.push("--topic".into());
            planner.args.push(planner.req_str("topic")?.into());
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--payload".into());
            planner.args.push(planner.req_str("payload")?.into());
        }
        "biomimicry_cryptobiosis_force" => {
            planner.args = vec!["biomimicry".into(), "cryptobiosis-force".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
        }
        "biomimicry_ampk_alter" => {
            planner.args = vec!["biomimicry".into(), "ampk-alter".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--atp".into());
            planner.args.push(planner.req_str("atp")?.into());
            planner.args.push("--adp".into());
            planner.args.push(planner.req_str("adp")?.into());
            planner.args.push("--amp".into());
            planner.args.push(planner.req_str("amp")?.into());
        }
        "biomimicry_observe_gradient" => {
            planner.args = vec!["biomimicry".into(), "observe-gradient".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
        }
        "biomimicry_manipulate_gradient" => {
            planner.args = vec!["biomimicry".into(), "manipulate-gradient".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--gradient-value".into());
            planner.args.push(planner.req_str("gradient_value")?.into());
        }
        "biomimicry_gate_evaluate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "gate");
            planner.push_flag("--action", "evaluate");
            planner.push_flag("--param", &format!("phase={}", planner.req_str("phase")?));
            for key in [
                "genome_coherent",
                "niche_available",
                "budget_allocated",
                "genome_state_leak",
                "parent_snapshot_sealed",
                "world_isolated_cow",
                "pre_run_snapshot_sealed",
                "invariants_respected",
                "cross_world_leak",
                "diff_complete",
                "replay_verified",
                "pareto_validated",
                "heredity_proven",
            ] {
                if let Some(value) = planner.opt_bool(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
        }
        "genos_epigenetic_chromatin" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "epigenetic_chromatin");
            planner.push_flag("--action", "modulate");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            planner.push_flag("--param", &format!("promoter={}", planner.req_str("promoter")?));
            if let Some(meth) = planner.opt_str("methylation_delta")? {
                planner.push_flag("--param", &format!("methylation_delta={meth}"));
            }
            if let Some(acetyl) = planner.opt_str("acetylation_delta")? {
                planner.push_flag("--param", &format!("acetylation_delta={acetyl}"));
            }
        }
        "biomimicry_chaperone_repair" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "chaperone");
            planner.push_flag("--action", "repair");
            planner.push_flag(
                "--param",
                &format!("component_id={}", planner.req_str("component_id")?),
            );
            planner.push_flag("--param", &format!("kind={}", planner.req_str("kind")?));
            let fragments = planner.object.get("fragments").and_then(Value::as_array);
            if let Some(values) = fragments {
                for fragment in values {
                    let fragment = fragment.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("fragment={fragment}"));
                }
            }
            let templates = planner.object.get("templates").and_then(Value::as_array);
            if let Some(values) = templates {
                for template in values {
                    let template = template.as_str().unwrap_or("-");
                    planner.push_flag("--param", &format!("template={template}"));
                }
            }
            if let Some(attempts) = planner.opt_str("max_attempts")? {
                planner.push_flag("--param", &format!("max_attempts={attempts}"));
            }
            if let Some(budget) = planner.opt_str("atp_budget")? {
                planner.push_flag("--param", &format!("atp_budget={budget}"));
            }
        }
        "biomimicry_vaccinate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "vaccination");
            planner.push_flag("--action", "train");
            if let Some(values) = planner.object.get("malicious").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("malicious={value}"));
                }
            }
            if let Some(values) = planner.object.get("benign").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("benign={value}"));
                }
            }
            if let Some(probe) = planner.opt_str("probe")? {
                planner.push_flag("--param", &format!("probe={probe}"));
            }
        }
        "biomimicry_interferon_emit" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "interferon");
            planner.push_flag("--action", "emit");
            planner.push_flag("--param", &format!("source={}", planner.req_str("source_id")?));
            planner.push_flag(
                "--param",
                &format!("signature={}", planner.req_str("signature")?),
            );
            if let Some(ttl) = planner.opt_str("ttl_seconds")? {
                planner.push_flag("--param", &format!("ttl_seconds={ttl}"));
            }
            if let Some(values) = planner.object.get("neighbors").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("neighbor={value}"));
                }
            }
        }
        "biomimicry_sar_prime" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "sar");
            let has_probe = planner.opt_str("probe")?.is_some();
            let has_primings = planner
                .object
                .get("primings")
                .and_then(Value::as_array)
                .map_or(false, |v| !v.is_empty());
            if has_probe || has_primings {
                planner.push_flag("--action", "assess");
            } else {
                planner.push_flag("--action", "prime");
            }
            for key in ["incident_id", "signature", "half_life_days", "now_day", "probe"] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
            if let Some(values) = planner.object.get("primings").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("priming={value}"));
                }
            }
        }
        "biomimicry_reciprocity_decide" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "reciprocity");
            planner.push_flag("--action", "decide");
            planner.push_flag("--param", &format!("peer_id={}", planner.req_str("peer_id")?));
            for key in ["cooperations", "defections", "last_action"] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
        }
        "biomimicry_skill_proceduralize" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "proceduralization");
            let has_failure_rate = planner.opt_str("failure_rate")?.is_some();
            let has_steps = planner
                .object
                .get("steps")
                .and_then(Value::as_array)
                .map_or(false, |v| !v.is_empty());
            if has_failure_rate && !has_steps {
                planner.push_flag("--action", "monitor");
            } else {
                planner.push_flag("--action", "compile");
            }
            for key in [
                "skill",
                "successes",
                "failures",
                "variance",
                "failure_rate",
            ] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
            for (key, param) in [("steps", "step"), ("preconditions", "precondition")] {
                if let Some(values) = planner.object.get(key).and_then(Value::as_array) {
                    for value in values {
                        let value = value.as_str().unwrap_or_default();
                        planner.push_flag("--param", &format!("{param}={value}"));
                    }
                }
            }
        }
        "biomimicry_telomere_fork" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "telomere");
            let is_restore = matches!(
                planner.opt_str("action")?,
                Some(value) if value == "restore"
            );
            if is_restore {
                planner.push_flag("--action", "restore");
            } else {
                planner.push_flag("--action", "fork");
            }
            for key in [
                "capsule_id",
                "remaining",
                "max_forks",
                "new_max",
                "restoration_count",
                "max_restorations",
            ] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
        }
        "biomimicry_senescence_assess" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "senescence");
            planner.push_flag("--action", "assess");
            for key in [
                "capsule_id",
                "productive_ticks",
                "idle_ticks",
                "resources_consumed",
                "negative_externalities",
                "intentional_dormancy",
            ] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
        }
        "biomimicry_neoteny_quota" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "neoteny");
            planner.push_flag("--action", "quota");
            for key in ["total_agents", "neotenic_agents", "request", "fraction"] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
        }
        "biomimicry_speciation_check" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "speciation");
            planner.push_flag("--action", "check");
            if let Some(values) = planner.object.get("allele-a").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("allele-a={value}"));
                }
            }
            if let Some(values) = planner.object.get("allele-b").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("allele-b={value}"));
                }
            }
            for key in ["hybrid_threshold", "speciation_threshold"] {
                if let Some(value) = planner.opt_str(key)? {
                    planner.push_flag("--param", &format!("{key}={value}"));
                }
            }
        }
        "biomimicry_bet_hedge_allocate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "bet-hedging");
            planner.push_flag("--action", "allocate");
            planner.push_flag(
                "--param",
                &format!("total_budget={}", planner.req_str("total_budget")?),
            );
            if let Some(entropy) = planner.opt_str("entropy")? {
                planner.push_flag("--param", &format!("entropy={entropy}"));
            }
            if let Some(values) = planner.object.get("scenario").and_then(Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("scenario={value}"));
                }
            }
        }
        "biomimicry_embryo_phase_advance" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "embryogenesis");
            planner.push_flag("--action", "advance");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            planner.push_flag("--param", &format!("target_phase={}", planner.req_str("target_phase")?));
        }
        "biomimicry_hox_verify" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "hox");
            planner.push_flag("--action", "verify");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            if let Some(values) = planner.object.get("sequence").and_then(serde_json::Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("sequence={value}"));
                }
            }
        }
        "biomimicry_canalization_evaluate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "canalization");
            planner.push_flag("--action", "evaluate");
            planner.push_flag("--param", &format!("expected_phenotype={}", planner.req_str("expected_phenotype")?));
            if let Some(vw) = planner.opt_str("valley_width")? {
                planner.push_flag("--param", &format!("valley_width={vw}"));
            }
            if let Some(values) = planner.object.get("trajectory").and_then(serde_json::Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("trajectory={value}"));
                }
            }
        }
        "biomimicry_metamorphosis_transition" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "metamorphosis");
            planner.push_flag("--action", "transition");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            planner.push_flag("--param", &format!("current_stage={}", planner.req_str("current_stage")?));
            if let Some(values) = planner.object.get("current_tool").and_then(serde_json::Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("current_tool={value}"));
                }
            }
            if let Some(values) = planner.object.get("target_tool").and_then(serde_json::Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("target_tool={value}"));
                }
            }
        }
        "biomimicry_regeneration_tissue" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "regeneration");
            planner.push_flag("--action", "tissue");
            planner.push_flag("--param", &format!("module_id={}", planner.req_str("module_id")?));
            planner.push_flag("--param", &format!("regenerate_action={}", planner.req_str("regenerate_action")?));
            if let Some(b) = planner.opt_str("base_checkpoint_hash")? {
                planner.push_flag("--param", &format!("base_checkpoint_hash={b}"));
            }
        }
        "biomimicry_endocrine_modulate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "endocrine");
            planner.push_flag("--action", "modulate");
            if let Some(b) = planner.opt_str("swarm_id")? {
                planner.push_flag("--param", &format!("swarm_id={b}"));
            }
            planner.push_flag("--param", &format!("endocrine_action={}", planner.req_str("endocrine_action")?));
            if let Some(b) = planner.opt_str("hormone")? {
                planner.push_flag("--param", &format!("hormone={b}"));
            }
            if let Some(b) = planner.opt_str("amount")? {
                planner.push_flag("--param", &format!("amount={b}"));
            }
            if let Some(b) = planner.opt_str("decay_factor")? {
                planner.push_flag("--param", &format!("decay_factor={b}"));
            }
        }
        "biomimicry_reflex_trigger" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "reflex");
            planner.push_flag("--action", "trigger");
            planner.push_flag("--param", &format!("stimulus={}", planner.req_str("stimulus")?));
            planner.push_flag("--param", &format!("value={}", planner.req_str("value")?));
            if let Some(b) = planner.opt_str("pain_threshold")? {
                planner.push_flag("--param", &format!("pain_threshold={b}"));
            }
            if let Some(b) = planner.opt_str("heat_threshold")? {
                planner.push_flag("--param", &format!("heat_threshold={b}"));
            }
        }
        "biomimicry_neuromodulation_rpe" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "neuromodulation");
            planner.push_flag("--action", "rpe");
            planner.push_flag("--param", &format!("node_id={}", planner.req_str("node_id")?));
            planner.push_flag("--param", &format!("expected_reward={}", planner.req_str("expected_reward")?));
            planner.push_flag("--param", &format!("actual_reward={}", planner.req_str("actual_reward")?));
        }
        "biomimicry_hippocampal_consolidate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "hippocampal");
            planner.push_flag("--action", "consolidate");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            planner.push_flag("--param", &format!("success_score={}", planner.req_str("success_score")?));
            if let Some(values) = planner.object.get("dag_step").and_then(serde_json::Value::as_array) {
                for value in values {
                    let value = value.as_str().unwrap_or_default();
                    planner.push_flag("--param", &format!("dag_step={value}"));
                }
            }
        }
        "biomimicry_circadian_toggle" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "circadian");
            planner.push_flag("--action", "toggle");
            planner.push_flag("--param", &format!("swarm_id={}", planner.req_str("swarm_id")?));
            planner.push_flag("--param", &format!("current_phase={}", planner.req_str("current_phase")?));
        }
        "biomimicry_allostasis_anticipate" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "allostasis");
            planner.push_flag("--action", "anticipate");
            planner.push_flag("--param", &format!("swarm_id={}", planner.req_str("swarm_id")?));
            planner.push_flag("--param", &format!("stress_cue={}", planner.req_str("stress_cue")?));
            if let Some(b) = planner.opt_str("base_budget")? {
                planner.push_flag("--param", &format!("base_budget={b}"));
            }
        }
        "biomimicry_plasticity_remap" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "plasticity");
            planner.push_flag("--action", "remap");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            planner.push_flag("--param", &format!("failing_tool={}", planner.req_str("failing_tool")?));
        }
        "biomimicry_immuno_inflammation" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "inflammation");
            planner.push_flag("--action", &planner.req_str("action")?);
            if let Some(b) = planner.opt_str("swarm_id")? {
                planner.push_flag("--param", &format!("swarm_id={b}"));
            }
            if let Some(b) = planner.opt_str("threat_level")? {
                planner.push_flag("--param", &format!("threat_level={b}"));
            }
            if let Some(b) = planner.opt_str("recovery_rate")? {
                planner.push_flag("--param", &format!("recovery_rate={b}"));
            }
        }
        "biomimicry_immuno_autoimmunity" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "autoimmunity");
            planner.push_flag("--action", &planner.req_str("action")?);
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            if let Some(b) = planner.opt_str("threshold")? {
                planner.push_flag("--param", &format!("threshold={b}"));
            }
            if let Some(b) = planner.opt_str("recent_kills")? {
                planner.push_flag("--param", &format!("recent_kills={b}"));
            }
        }
        "biomimicry_ecology_punctuated" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "ecology");
            planner.push_flag("--action", "punctuated");
            planner.push_flag("--param", &format!("agent_id={}", planner.req_str("agent_id")?));
            planner.push_flag("--param", &format!("improved={}", planner.req_str("improved")?));
            if let Some(b) = planner.opt_str("stasis_counter")? {
                planner.push_flag("--param", &format!("stasis_counter={b}"));
            }
            if let Some(b) = planner.opt_str("plateau_threshold")? {
                planner.push_flag("--param", &format!("plateau_threshold={b}"));
            }
        }
        "biomimicry_ecology_succession" => {
            planner.args = vec!["biomimicry".into(), "bio-feature".into()];
            planner.push_flag("--feature", "ecology");
            planner.push_flag("--action", "succession");
            planner.push_flag("--param", &format!("project_id={}", planner.req_str("project_id")?));
            planner.push_flag("--param", &format!("coverage={}", planner.req_str("coverage")?));
            planner.push_flag("--param", &format!("stability={}", planner.req_str("stability")?));
            if let Some(b) = planner.opt_str("current_stage")? {
                planner.push_flag("--param", &format!("current_stage={b}"));
            }
        }
        _ => return Ok(false),
    }
    Ok(true)
}


