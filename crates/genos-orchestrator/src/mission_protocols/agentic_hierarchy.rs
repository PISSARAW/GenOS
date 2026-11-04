//! Arbre admis et immuable ; la délégation active un rôle sans créer de droit.
use super::{AgenticConfig,OrchestrationConfig};
use std::collections::BTreeSet;

impl OrchestrationConfig {
    pub fn can_delegate(&self, id:&str) -> bool {
        id==self.coordinator || self.hierarchy.as_ref().is_some_and(|tree|tree.parents.values().any(|parent|parent==id))
    }

    pub fn permits(&self, parent:&str, child:&str) -> bool {
        if child==self.coordinator || parent==child { return false; }
        match &self.hierarchy {
            Some(tree)=>tree.parents.get(child).is_some_and(|value|value==parent),
            None=>parent==self.coordinator,
        }
    }

    pub fn depth(&self, id:&str) -> Result<u32,String> {
        if id==self.coordinator { return Ok(0); }
        let Some(tree)=&self.hierarchy else { return Ok(1); };
        let mut current=id;let mut seen=BTreeSet::new();let mut depth=0;
        while current!=self.coordinator {
            if !seen.insert(current) { return Err("AGENTIC_HIERARCHY_CYCLE".into()); }
            current=tree.parents.get(current).ok_or("AGENTIC_HIERARCHY_PARENT_MISSING")?;
            depth+=1;
            if depth>tree.max_depth { return Err("AGENTIC_HIERARCHY_DEPTH_EXCEEDED".into()); }
        }
        Ok(depth)
    }
}

pub(super) fn validate(config:&AgenticConfig, mode:&OrchestrationConfig) -> Result<(),String> {
    let Some(tree)=&mode.hierarchy else { return Ok(()); };
    if !(1..=4).contains(&tree.max_depth) || !(1..=4).contains(&tree.max_children) {
        return Err("AGENTIC_HIERARCHY_LIMIT_INVALID".into());
    }
    let ids:BTreeSet<_>=config.agents.iter().map(|agent|agent.id.as_str()).collect();
    let expected:BTreeSet<_>=ids.iter().copied().filter(|id|*id!=mode.coordinator).collect();
    let children:BTreeSet<_>=tree.parents.keys().map(String::as_str).collect();
    if children!=expected { return Err("AGENTIC_HIERARCHY_COVERAGE_INVALID".into()); }
    validate_edges(mode,&ids)
}

fn validate_edges(mode:&OrchestrationConfig, ids:&BTreeSet<&str>) -> Result<(),String> {
    let tree=mode.hierarchy.as_ref().ok_or("AGENTIC_HIERARCHY_REQUIRED")?;
    let mut counts=std::collections::BTreeMap::<&str,u32>::new();
    for (child,parent) in &tree.parents {
        if !ids.contains(parent.as_str()) || child==parent { return Err("AGENTIC_HIERARCHY_PARENT_INVALID".into()); }
        mode.depth(child)?;
        let count=counts.entry(parent).or_default();*count+=1;
        if *count>tree.max_children { return Err("AGENTIC_HIERARCHY_FANOUT_EXCEEDED".into()); }
    }
    Ok(())
}

#[cfg(test)]
#[path="agentic_hierarchy_tests.rs"]
mod tests;
