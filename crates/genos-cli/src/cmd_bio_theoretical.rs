use anyhow::{bail, Result};
use genos_core::biomimicry::autopoiesis::{AutopoiesisValidator, DagNode};

pub fn autopoiesis_validate(params: &[String]) -> Result<()> {
    let mut threshold = 10000;
    let mut downtime = 0;
    let mut nodes_str = String::new();
    let mut producers_str = String::new();
    
    for p in params {
        if let Some((k, v)) = p.split_once('=') {
            match k {
                "threshold" => threshold = v.parse()?,
                "downtime" => downtime = v.parse()?,
                "nodes" => nodes_str = v.to_string(), // comma separated ids, prefix with ! for boundary
                "producers" => producers_str = v.to_string(), // format: prod_id:producer_id,...
                _ => {}
            }
        }
    }

    let mut nodes = Vec::new();
    if !nodes_str.is_empty() {
        for n in nodes_str.split(',') {
            if let Some(id) = n.strip_prefix('!') {
                nodes.push(DagNode { id: id.to_string(), is_boundary: true });
            } else {
                nodes.push(DagNode { id: n.to_string(), is_boundary: false });
            }
        }
    }

    let mut producers = Vec::new();
    if !producers_str.is_empty() {
        for pair in producers_str.split(',') {
            if let Some((prod, maker)) = pair.split_once(':') {
                producers.push((prod.to_string(), maker.to_string()));
            }
        }
    }

    let validator = AutopoiesisValidator::new(threshold);
    let report = validator.evaluate_viability(&nodes, &producers, downtime);
    
    println!("Autopoiesis report: state={}, missing_production={}, unmaintained_boundaries={}", 
        report.state.as_str(),
        report.missing_production.len(),
        report.unmaintained_boundaries.len()
    );

    Ok(())
}
