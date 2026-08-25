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
        _ => return Ok(false),
    }
    Ok(true)
}
