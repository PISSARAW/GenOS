use std::time::Instant;

#[derive(Clone, Debug)]
pub struct WorldState {
    pub id: u8,
    pub title: String,
    pub subtitle: String,
    pub strategy: String,
    pub hypothesis: String,
    pub model_tier: String,
    pub status: String,
    pub progress: u16,
    pub tokens: u32,
    pub logs: Vec<String>,
    pub evidence_score: f64,
    pub verdict: String,
    pub key_findings: Vec<String>,
}

impl WorldState {
    pub fn new(id: u8, title: &str, subtitle: &str) -> Self {
        let (strategy, hypothesis, model_tier) = match id {
            1 => (
                "Direct Naive Execution".to_string(),
                "Implement raw need with minimal upfront assumptions".to_string(),
                "Standard (Fast)".to_string(),
            ),
            2 => (
                "Interview Plan & Spec".to_string(),
                "Implement from formal BEP 0003 grammar & invariants".to_string(),
                "Frontier (Deep)".to_string(),
            ),
            _ => (
                "Self-Correcting Adversarial".to_string(),
                "Falsify with hostile fuzzing and auto-repair".to_string(),
                "Frontier (Self-Refining)".to_string(),
            ),
        };
        Self {
            id,
            title: title.to_string(),
            subtitle: subtitle.to_string(),
            strategy,
            hypothesis,
            model_tier,
            status: "INITIALIZING".to_string(),
            progress: 0,
            tokens: 0,
            logs: Vec::new(),
            evidence_score: 0.0,
            verdict: "PENDING".to_string(),
            key_findings: Vec::new(),
        }
    }
}

pub struct TrinityApp {
    pub mission_id: String,
    pub prompt: String,
    pub worlds: Vec<WorldState>,
    pub step: usize,
    pub max_steps: usize,
    pub completed: bool,
    pub show_dashboard: bool,
    pub focused_world: Option<u8>,
    pub start_time: Instant,
}

impl TrinityApp {
    pub fn new(mission_id: &str, prompt: &str) -> Self {
        let w1 = WorldState::new(1, "World 1: Naïf", "Direct Execution");
        let w2 = WorldState::new(2, "World 2: Planifié", "Formal Grammar & Spec");
        let w3 = WorldState::new(3, "World 3: Auto-corrigé", "Adversarial & Self-Healing");
        Self {
            mission_id: mission_id.to_string(),
            prompt: prompt.to_string(),
            worlds: vec![w1, w2, w3],
            step: 0,
            max_steps: 10,
            completed: false,
            show_dashboard: false,
            focused_world: None,
            start_time: Instant::now(),
        }
    }

    pub fn tick(&mut self) {
        if self.completed {
            return;
        }
        self.step += 1;
        self.apply_world_1_step(self.step);
        self.apply_world_2_step(self.step);
        self.apply_world_3_step(self.step);

        if self.step >= self.max_steps {
            self.completed = true;
            self.show_dashboard = true;
        }
    }

    pub fn toggle_dashboard(&mut self) {
        self.show_dashboard = !self.show_dashboard;
    }

    pub fn focus_world(&mut self, world_id: u8) {
        if self.focused_world == Some(world_id) {
            self.focused_world = None;
        } else {
            self.focused_world = Some(world_id);
        }
    }

    pub fn restart(&mut self) {
        let mission_id = self.mission_id.clone();
        let prompt = self.prompt.clone();
        *self = Self::new(&mission_id, &prompt);
    }

    fn apply_world_1_step(&mut self, step: usize) {
        let w = &mut self.worlds[0];
        w.tokens += 185;
        w.progress = (step * 10).min(100) as u16;
        match step {
            1 => {
                w.status = "SPAWNING".to_string();
                w.logs.push("[0.2s] 🚀 VFS capsule provisioned (ephemeral scratch)".to_string());
            }
            2 => {
                w.status = "RUNNING".to_string();
                w.logs.push("[0.6s] ⚡ Direct prompt parse: scanning for 'i', 'l', 'd'".to_string());
            }
            3 => {
                w.logs.push("[1.0s] 📝 Implementing naive recursive descent parser".to_string());
            }
            4 => {
                w.logs.push("[1.4s] 🔨 parse_int: handles 'i42e' -> Ok(42)".to_string());
            }
            5 => {
                w.logs.push("[1.9s] 🔨 parse_string: handles '4:spam' -> Ok(\"spam\")".to_string());
            }
            6 => {
                w.logs.push("[2.4s] 🔨 parse_list: recursive call for items".to_string());
            }
            7 => {
                w.logs.push("[2.9s] ⚠️ WARNING: No recursion depth limit configured!".to_string());
            }
            8 => {
                w.logs.push("[3.3s] ⚠️ WARNING: 'i03e' accepted (leading zero bug)".to_string());
            }
            9 => {
                w.logs.push("[3.8s] 🧪 Basic tests: 12/15 passed. Edge cases failed.".to_string());
            }
            _ => {
                w.status = "FINISHED".to_string();
                w.evidence_score = 0.72;
                w.verdict = "REJECTED (INCOMPLETE)".to_string();
                w.key_findings = vec![
                    "Recursion stack overflow risk".to_string(),
                    "Missing BEP 0003 leading zero checks".to_string(),
                    "Unsorted dict keys tolerated".to_string(),
                ];
                w.logs.push("[4.2s] 📊 Dossier sealed: 0.72 score (3 critical flaws)".to_string());
            }
        }
    }

    fn apply_world_2_step(&mut self, step: usize) {
        let w = &mut self.worlds[1];
        w.tokens += 420;
        w.progress = (step * 10).min(100) as u16;
        match step {
            1 => {
                w.status = "DECOMPOSING".to_string();
                w.logs.push("[0.2s] 📐 Invariant analysis from BEP 0003 specification".to_string());
            }
            2 => {
                w.logs.push("[0.7s] 📐 Spec rule 1: No leading zeroes allowed in integers".to_string());
            }
            3 => {
                w.status = "MODELING".to_string();
                w.logs.push("[1.1s] 📐 Spec rule 2: Negative zero ('i-0e') strictly illegal".to_string());
            }
            4 => {
                w.logs.push("[1.6s] 🏗️ Zero-copy AST design: enum BencodeValue<'a>".to_string());
            }
            5 => {
                w.status = "EXECUTING".to_string();
                w.logs.push("[2.1s] 🛡️ Iterative parser with MAX_DEPTH = 128 guardrail".to_string());
            }
            6 => {
                w.logs.push("[2.6s] 🔍 Lexicographical key sort validator implemented".to_string());
            }
            7 => {
                w.logs.push("[3.1s] 🧪 Running 18 canonical BEP 0003 test vectors".to_string());
            }
            8 => {
                w.logs.push("[3.6s] ✔️ All 18 canonical specification tests passed".to_string());
            }
            9 => {
                w.status = "VERIFYING".to_string();
                w.logs.push("[4.1s] 📜 Formal invariant claims generated for dossier".to_string());
            }
            _ => {
                w.status = "FINISHED".to_string();
                w.evidence_score = 0.94;
                w.verdict = "COMPATIBLE".to_string();
                w.key_findings = vec![
                    "Zero-copy slice representation".to_string(),
                    "100% BEP 0003 grammar compliance".to_string(),
                    "Iterative depth protection (128)".to_string(),
                ];
                w.logs.push("[4.5s] 📊 Dossier sealed: 0.94 score (18/18 tests pass)".to_string());
            }
        }
    }

    fn apply_world_3_step(&mut self, step: usize) {
        let w = &mut self.worlds[2];
        w.tokens += 510;
        w.progress = (step * 10).min(100) as u16;
        match step {
            1 => {
                w.status = "CHALLENGING".to_string();
                w.logs.push("[0.2s] ⚔️ Autonomous adversarial fuzzer generator launched".to_string());
            }
            2 => {
                w.logs.push("[0.7s] 💥 Fuzz attack 1: integer overflow i9223372036854775808e".to_string());
            }
            3 => {
                w.status = "REPAIRING".to_string();
                w.logs.push("[1.2s] 🔧 Patch applied: checked_add overflow detection".to_string());
            }
            4 => {
                w.logs.push("[1.7s] 💥 Fuzz attack 2: truncated payload '10:abc'".to_string());
            }
            5 => {
                w.logs.push("[2.2s] 🔧 Patch applied: UnexpectedEof with exact byte index".to_string());
            }
            6 => {
                w.logs.push("[2.7s] 💥 Fuzz attack 3: non-canonical unsorted dictionary".to_string());
            }
            7 => {
                w.status = "REPAIRING".to_string();
                w.logs.push("[3.2s] 🔧 Patch applied: pairwise byte order comparator".to_string());
            }
            8 => {
                w.logs.push("[3.7s] 🛡️ 4/4 adversarial vectors neutralized and verified".to_string());
            }
            9 => {
                w.status = "VERIFYING".to_string();
                w.logs.push("[4.2s] 🔐 Cryptographic test receipts compiled to evidence".to_string());
            }
            _ => {
                w.status = "FINISHED".to_string();
                w.evidence_score = 0.98;
                w.verdict = "WINNER (PROMOTED)".to_string();
                w.key_findings = vec![
                    "Overflow & truncated EOF defended".to_string(),
                    "Lexicographic dict key enforcement".to_string(),
                    "Cryptographic falsification receipts".to_string(),
                ];
                w.logs.push("[4.8s] 🏆 Dossier sealed: 0.98 score (Vulnerabilities neutralized)".to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trinity_app_initialization() {
        let app = TrinityApp::new("mission-test", "Test prompt");
        assert_eq!(app.worlds.len(), 3);
        assert_eq!(app.worlds[0].id, 1);
        assert_eq!(app.worlds[1].id, 2);
        assert_eq!(app.worlds[2].id, 3);
        assert_eq!(app.mission_id, "mission-test");
        assert_eq!(app.prompt, "Test prompt");
        assert_eq!(app.focused_world, None);
        assert!(!app.show_dashboard);
    }

    #[test]
    fn test_trinity_app_progression_and_synthesis() {
        let mut app = TrinityApp::new("mission-test", "Bencode parser");
        for _ in 0..12 {
            app.tick();
        }
        assert!(app.completed);
        assert_eq!(app.worlds[0].status, "FINISHED");
        assert_eq!(app.worlds[1].status, "FINISHED");
        assert_eq!(app.worlds[2].status, "FINISHED");
        assert_eq!(app.worlds[0].verdict, "REJECTED (INCOMPLETE)");
        assert_eq!(app.worlds[1].verdict, "COMPATIBLE");
        assert_eq!(app.worlds[2].verdict, "WINNER (PROMOTED)");
        assert!(app.worlds[2].evidence_score > app.worlds[0].evidence_score);
    }

    #[test]
    fn test_trinity_app_controls() {
        let mut app = TrinityApp::new("m1", "p1");
        app.toggle_dashboard();
        assert!(app.show_dashboard);
        app.focus_world(2);
        assert_eq!(app.focused_world, Some(2));
        app.restart();
        assert_eq!(app.step, 0);
        assert_eq!(app.worlds[0].progress, 0);
    }
}
