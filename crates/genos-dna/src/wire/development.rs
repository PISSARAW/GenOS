use super::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireEpiMark {
    pub kind: String,
    pub level: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireEpigenome {
    #[serde(default)]
    pub marks: BTreeMap<String, WireEpiMark>,
    #[serde(default)]
    pub stage: String,
    #[serde(default)]
    pub stress_memory: Vec<String>,
    #[serde(default)]
    pub generation: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireGrnNode {
    pub is_tf: bool,
    pub basal: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireGrnEdge {
    pub from: String,
    pub to: String,
    pub weight: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireGrn {
    #[serde(default)]
    pub nodes: BTreeMap<String, WireGrnNode>,
    #[serde(default)]
    pub edges: Vec<WireGrnEdge>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireDevelopment {
    #[serde(default)]
    pub stage: String,
    pub lineage: Option<String>,
    #[serde(default)]
    pub morphogens: Vec<String>,
    pub signal: Option<String>,
}

pub fn epigenome_to_wire(epi: &crate::model::EpigenomeState) -> WireEpigenome {
    let mut marks = BTreeMap::new();
    for (locus, mark) in &epi.marks {
        marks.insert(locus.clone(), WireEpiMark { kind: mark.kind.clone(), level: mark.level });
    }
    WireEpigenome {
        marks,
        stage: epi.stage.clone(),
        stress_memory: epi.stress_memory.clone(),
        generation: epi.generation,
    }
}

pub fn wire_to_epigenome(wire: WireEpigenome) -> crate::model::EpigenomeState {
    let mut marks = BTreeMap::new();
    for (locus, mark) in wire.marks {
        marks.insert(locus, crate::model::EpiMark { kind: mark.kind, level: mark.level.clamp(0.0, 1.0) });
    }
    crate::model::EpigenomeState {
        marks,
        stage: normalize_stage(&wire.stage),
        stress_memory: wire.stress_memory,
        generation: wire.generation,
    }
}

fn normalize_stage(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Zygote".to_string();
    }
    trimmed.to_string()
}

pub fn grn_to_wire(grn: &crate::model::GrnState) -> WireGrn {
    let mut nodes = BTreeMap::new();
    for (locus, node) in &grn.nodes {
        nodes.insert(locus.clone(), WireGrnNode { is_tf: node.is_tf, basal: node.basal_expression });
    }
    let edges = grn.edges.iter().map(|edge| WireGrnEdge {
        from: edge.from.clone(),
        to: edge.to.clone(),
        weight: edge.weight,
    }).collect();
    WireGrn { nodes, edges }
}

pub fn wire_to_grn(wire: WireGrn) -> crate::model::GrnState {
    let nodes = wire.nodes_to_model();
    let edges = wire.edges_to_model();
    crate::model::GrnState { nodes, edges }
}

impl WireGrn {
    fn nodes_to_model(&self) -> BTreeMap<String, crate::model::GrnNode> {
        let mut out = BTreeMap::new();
        for (locus, node) in &self.nodes {
            out.insert(locus.clone(), crate::model::GrnNode {
                is_tf: node.is_tf,
                basal_expression: node.basal.clamp(0.0, 1.0),
            });
        }
        out
    }

    fn edges_to_model(&self) -> Vec<crate::model::GrnEdge> {
        self.edges.iter().map(|edge| crate::model::GrnEdge {
            from: edge.from.clone(),
            to: edge.to.clone(),
            weight: edge.weight.clamp(-1.0, 1.0),
        }).collect()
    }
}

pub fn development_to_wire(dev: &crate::model::DevelopmentState) -> WireDevelopment {
    WireDevelopment {
        stage: dev.stage.clone(),
        lineage: dev.lineage_commitment.clone(),
        morphogens: dev.morphogens.clone(),
        signal: dev.differentiation_signal.clone(),
    }
}

pub fn wire_to_development(wire: WireDevelopment) -> crate::model::DevelopmentState {
    crate::model::DevelopmentState {
        stage: normalize_stage(&wire.stage),
        lineage_commitment: wire.lineage,
        morphogens: wire.morphogens,
        differentiation_signal: wire.signal,
    }
}
