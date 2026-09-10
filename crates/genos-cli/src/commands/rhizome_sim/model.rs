#[derive(Clone, Debug, PartialEq)]
pub struct Node {
    pub id: u8,
    pub role: String,
    pub label: String,
    pub x: f32,
    pub y: f32,
    pub alpha: f32,
    pub state: String,
    pub color_idx: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Edge {
    pub from: u8,
    pub to: u8,
    pub alpha: f32,
    pub pulse: f32,
}

#[derive(Clone, Debug)]
pub struct RhizomeSim {
    pub step: usize,
    pub max_steps: usize,
    pub phase: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub logs: Vec<String>,
    pub api_gap: String,
    pub evidence_score: f64,
    pub hook_text: String,
    pub completed: bool,
}

impl RhizomeSim {
    pub fn new() -> Self {
        let mut sim = Self {
            step: 0,
            max_steps: 14,
            phase: "1. BASELINE TOPOLOGY".to_string(),
            nodes: Vec::new(),
            edges: Vec::new(),
            logs: Vec::new(),
            api_gap: "Missing OAuth2 token rotation & rate-limited bulk ingestion API".to_string(),
            evidence_score: 0.0,
            hook_text: "What if your agent graph wasn't static? Watch our Rhizome runtime dynamically spawn capability offshoots when it hits a boundary.".to_string(),
            completed: false,
        };
        sim.init_baseline();
        sim
    }

    fn init_baseline(&mut self) {
        self.nodes = vec![
            Node {
                id: 1,
                role: "rootless_coordinator".to_string(),
                label: "Rootless Coordinator".to_string(),
                x: 0.32,
                y: 0.52,
                alpha: 1.0,
                state: "STABLE".to_string(),
                color_idx: 5, // Green
            },
            Node {
                id: 2,
                role: "boundary_scout".to_string(),
                label: "Boundary Scout".to_string(),
                x: 0.68,
                y: 0.52,
                alpha: 1.0,
                state: "SCANNING".to_string(),
                color_idx: 7, // Cyan
            },
        ];
        self.edges = vec![Edge { from: 1, to: 2, alpha: 1.0, pulse: 0.1 }];
        self.logs = vec![
            "[0.0s] 🌿 Rhizome decentralized collective active (2 baseline nodes)".to_string(),
            "[0.4s] 🔍 Boundary Scout probing external upstream microservices".to_string(),
        ];
    }

    pub fn tick(&mut self) {
        if self.completed {
            return;
        }
        self.step += 1;
        match self.step {
            1..=2 => self.step_scanning(),
            3..=5 => self.step_gap_detected(),
            6..=8 => self.step_budding(),
            9..=11 => self.step_proof_execution(),
            12..=14 => self.step_contraction(),
            _ => {
                self.completed = true;
            }
        }
        if self.step >= self.max_steps {
            self.completed = true;
        }
    }

    fn step_scanning(&mut self) {
        self.phase = "1. ACTIVE SCOUTING".to_string();
        for edge in &mut self.edges {
            edge.pulse = (edge.pulse + 0.3) % 1.0;
        }
    }

    fn step_gap_detected(&mut self) {
        self.phase = "2. BOUNDARY GAP DETECTED".to_string();
        if let Some(scout) = self.nodes.iter_mut().find(|n| n.id == 2) {
            scout.state = "API_GAP_HIT".to_string();
            scout.color_idx = 9; // Orange alert
        }
        if self.step == 3 {
            self.logs.push("[1.2s] ⚠️ BOUNDARY HIT: Missing OAuth2 token rotation & rate-limited bulk ingestion".to_string());
            self.logs.push("[1.6s] ⚡ Collective growth triggered: zero central orchestrator bottleneck".to_string());
        }
    }

    fn step_budding(&mut self) {
        self.phase = "3. DYNAMIC BUDDING (SPAWNING)".to_string();
        if self.step == 6 {
            self.nodes.push(Node {
                id: 3,
                role: "capability_offshoot".to_string(),
                label: "Capability Offshoot".to_string(),
                x: 0.70,
                y: 0.22,
                alpha: 0.3,
                state: "SPAWNING".to_string(),
                color_idx: 11, // Magenta
            });
            self.nodes.push(Node {
                id: 4,
                role: "local_bridge".to_string(),
                label: "Local Bridge".to_string(),
                x: 0.48,
                y: 0.28,
                alpha: 0.3,
                state: "SPAWNING".to_string(),
                color_idx: 13, // Blue
            });
            self.edges.push(Edge { from: 2, to: 4, alpha: 0.4, pulse: 0.0 });
            self.edges.push(Edge { from: 4, to: 3, alpha: 0.4, pulse: 0.0 });
            self.edges.push(Edge { from: 3, to: 1, alpha: 0.4, pulse: 0.0 });
            self.logs.push("[2.2s] 🌱 BUDDING: Sprouted [Capability Offshoot #101] at boundary".to_string());
            self.logs.push("[2.6s] 🌉 BUDDING: Sprouted [Local Bridge #42] to preserve decentralized mesh".to_string());
        } else {
            for node in &mut self.nodes {
                if node.id == 3 || node.id == 4 {
                    node.alpha = (node.alpha + 0.35).min(1.0);
                    node.state = "ACTIVE".to_string();
                }
            }
            for edge in &mut self.edges {
                edge.alpha = (edge.alpha + 0.3).min(1.0);
            }
        }
    }

    fn step_proof_execution(&mut self) {
        self.phase = "4. PROOF EXECUTION & VERIFICATION".to_string();
        self.evidence_score = 0.99;
        for node in &mut self.nodes {
            node.color_idx = 5; // Neon green
            node.state = "VERIFIED".to_string();
        }
        if self.step == 9 {
            self.logs.push("[3.4s] 🔧 Capability Offshoot generated compliant OAuth2 token rotator".to_string());
            self.logs.push("[3.8s] 🧪 Local Bridge routed 18/18 mock API edge test cases: 100% passed".to_string());
            self.logs.push("[4.2s] 🛡️ Cryptographic receipt sealed: Evidence barrier 0.99 validated".to_string());
        }
    }

    fn step_contraction(&mut self) {
        self.phase = "5. HARMONIC CONTRACTION & PRUNING".to_string();
        for node in &mut self.nodes {
            if node.id == 3 || node.id == 4 {
                node.alpha = (node.alpha - 0.35).max(0.0);
                node.state = "CONTRACTING".to_string();
            }
        }
        for edge in &mut self.edges {
            if edge.from == 4 || edge.to == 4 || edge.from == 3 || edge.to == 3 {
                edge.alpha = (edge.alpha - 0.35).max(0.0);
            }
        }
        if self.step == 12 {
            self.logs.push("[4.8s] ✨ Proof absorbed into collective substrate memory".to_string());
            self.logs.push("[5.2s] 🧹 Ephemeral Offshoot & Bridge successfully contracted and pruned".to_string());
            self.logs.push("[5.6s] 🔄 Stable decentralized topology restored with cached capability".to_string());
        }
    }

    pub fn restart(&mut self) {
        self.step = 0;
        self.completed = false;
        self.evidence_score = 0.0;
        self.phase = "1. BASELINE TOPOLOGY".to_string();
        self.init_baseline();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rhizome_sim_lifecycle() {
        let mut sim = RhizomeSim::new();
        assert_eq!(sim.nodes.len(), 2);
        assert_eq!(sim.edges.len(), 1);
        assert_eq!(sim.step, 0);

        // Advance to gap detection
        for _ in 0..4 {
            sim.tick();
        }
        assert!(sim.phase.contains("GAP"));

        // Advance to budding
        for _ in 0..3 {
            sim.tick();
        }
        assert_eq!(sim.nodes.len(), 4);
        assert!(sim.phase.contains("BUDDING"));

        // Advance to verification
        for _ in 0..3 {
            sim.tick();
        }
        assert_eq!(sim.evidence_score, 0.99);

        // Advance to contraction and completion
        for _ in 0..5 {
            sim.tick();
        }
        assert!(sim.completed);

        // Test restart
        sim.restart();
        assert_eq!(sim.step, 0);
        assert_eq!(sim.nodes.len(), 2);
    }
}
