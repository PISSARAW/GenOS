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
        _ => return Ok(false),
    }
    Ok(true)
}
