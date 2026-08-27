use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_resilience(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "parasitic_pressure" => {
            planner.args = vec![
                "eval".into(),
                "parasitism".into(),
                planner.req_str("input")?.into(),
                "--output".into(),
                planner.req_str("output")?.into(),
            ];
            if planner.opt_str("evolve")? == Some("true") {
                planner.args.push("--evolve".into());
            }
        }
        "resilience_apoptosis" => {
            planner.args = vec!["resilience".into(), "apoptosis".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
        }
        "resilience_cryptobiosis" => {
            planner.args = vec!["resilience".into(), "cryptobiosis".into()];
            planner.args.push("--mode".into());
            planner.args.push(planner.req_str("mode")?.into());
        }
        "resilience_hypermutation" => {
            planner.args = vec!["resilience".into(), "hypermutation".into()];
            planner.args.push("--target".into());
            planner.args.push(planner.req_str("target")?.into());
        }
        "resilience_circuit_breaker" => {
            planner.args = vec!["resilience".into(), "circuit-breaker".into()];
            planner.args.push("--branch-id".into());
            planner.args.push(planner.req_str("branch_id")?.into());
        }
        "resilience_lytic_burst" => {
            planner.args = vec!["resilience".into(), "burst".into()];
            planner.args.push("--genome-id".into());
            planner.args.push(planner.req_str("genome_id")?.into());
            if let Some(clones) = planner.opt_str("clones")? {
                planner.args.push("--clones".into());
                planner.args.push(clones.into());
            }
            if let Some(seed) = planner.opt_str("seed")? {
                planner.args.push("--seed".into());
                planner.args.push(seed.into());
            }
        }
        "resilience_transduce" => {
            planner.args = vec!["resilience".into(), "transduce".into()];
            planner.args.push("--capsule-id".into());
            planner.args.push(planner.req_str("capsule_id")?.into());
            planner.args.push("--from-genome".into());
            planner.args.push(planner.req_str("from_genome")?.into());
            planner.args.push("--payload".into());
            planner.args.push(planner.req_str("payload")?.into());
            planner.args.push("--proof-hash".into());
            planner.args.push(planner.req_str("proof_hash")?.into());
            if let Some(signature) = planner.opt_str("signature")? {
                planner.args.push("--signature".into());
                planner.args.push(signature.into());
            }
        }
        "security_virophage_deploy" => {
            planner.args = vec!["resilience".into(), "virophage-deploy".into()];
            planner.args.push("--session-id".into());
            planner.args.push(planner.req_str("session_id")?.into());
            planner.args.push("--source-signature".into());
            planner
                .args
                .push(planner.req_str("source_signature")?.into());
        }
        "ais_negative_screen" => {
            planner.args = vec!["resilience".into(), "ais-negative-screen".into()];
            let candidates = planner.req_str("candidates")?;
            for (i, value) in candidates.split_whitespace().enumerate() {
                let _ = i;
                planner.args.push("--candidate".into());
                planner.args.push(value.into());
            }
            let self_corpus = planner.req_str("self_corpus")?;
            for value in self_corpus.split_whitespace() {
                planner.args.push("--self-sig".into());
                planner.args.push(value.into());
            }
        }
        "ais_clonal_hypermutate" => {
            planner.args = vec!["resilience".into(), "ais-clonal-hypermutate".into()];
            planner.args.push("--antibody-id".into());
            planner.args.push(planner.req_str("antibody_id")?.into());
            let centroid = planner.req_str("centroid")?;
            for value in centroid.split_whitespace() {
                planner.args.push("--centroid".into());
                planner.args.push(value.into());
            }
            let antigen = planner.req_str("antigen")?;
            for value in antigen.split_whitespace() {
                planner.args.push("--antigen".into());
                planner.args.push(value.into());
            }
            if let Some(seed) = planner.opt_str("seed")? {
                planner.args.push("--seed".into());
                planner.args.push(seed.into());
            }
        }
        "ais_danger_telemetry" => {
            planner.args = vec!["resilience".into(), "ais-danger-telemetry".into()];
            if let Some(failures) = planner.opt_str("consecutive_failures")? {
                planner.args.push("--failures".into());
                planner.args.push(failures.into());
            }
            if let Some(divergence) = planner.opt_str("semantic_divergence")? {
                planner.args.push("--semantic-divergence".into());
                planner.args.push(divergence.into());
            }
            if let Some(breach) = planner.opt_str("invariant_breach")? {
                if breach == "true" {
                    planner.args.push("--invariant-breach".into());
                }
            }
        }
        _ => return Ok(false),
    }
    Ok(true)
}
