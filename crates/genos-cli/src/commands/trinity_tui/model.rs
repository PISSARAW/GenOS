use std::time::Instant;

mod live_contract;
mod simulation;

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
    /// True when driven by real backend events instead of the scripted demo.
    pub live: bool,
    pub connected: bool,
    pub connection_message: String,
    pub barrier_status: String,
    pub barrier_detail: String,
    /// Last server `seq` applied; stale re-deliveries (seq < this) are dropped.
    pub last_live_seq: Option<u64>,
}

const MAX_LIVE_LOG_LINES: usize = 200;

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
            live: false,
            connected: false,
            connection_message: "Simulation mode".to_string(),
            barrier_status: "PENDING".to_string(),
            barrier_detail: String::new(),
            last_live_seq: None,
        }
    }

    /// Build an app driven by live NDJSON events from `trinityMonitorServer.js`
    /// instead of the scripted demo narrative.
    pub fn new_live(mission_id: &str) -> Self {
        let mut app = Self::new(mission_id, "Waiting for live mission data...");
        app.live = true;
        app.connected = false;
        app.connection_message = "Connecting to genos-tui monitor server...".to_string();
        for world in &mut app.worlds {
            world.status = "WAITING".to_string();
        }
        app
    }

    pub fn set_connection_status(&mut self, connected: bool, message: String) {
        self.connected = connected;
        self.connection_message = message;
    }

    /// Apply one NDJSON message emitted by the Trinity monitor server.
    pub fn apply_live_message(&mut self, value: &serde_json::Value) {
        match value.get("type").and_then(|v| v.as_str()) {
            Some("snapshot") => self.apply_snapshot(value),
            Some("log") => self.apply_log(value),
            Some("barrier") => self.apply_barrier(value),
            _ => {}
        }
    }

    fn world_mut(&mut self, world_number: u8) -> Option<&mut WorldState> {
        self.worlds.iter_mut().find(|w| w.id == world_number)
    }

    /// Contract gate shared by snapshot/log/barrier: drop stale sequences
    /// and foreign missions, adopt the first mission while unset.
    fn gate_live_message(&mut self, value: &serde_json::Value) -> bool {
        match live_contract::gate_message(&self.mission_id, self.last_live_seq, value) {
            live_contract::GateAction::Reject => false,
            live_contract::GateAction::Adopt(mission) => {
                self.mission_id = mission;
                self.note_live_seq(value);
                true
            }
            live_contract::GateAction::Accept => {
                self.note_live_seq(value);
                true
            }
        }
    }

    fn note_live_seq(&mut self, value: &serde_json::Value) {
        if let Some(seq) = live_contract::message_seq(value) {
            self.last_live_seq = Some(seq);
        }
    }

    fn apply_snapshot(&mut self, value: &serde_json::Value) {
        if !self.gate_live_message(value) {
            return;
        }
        if let Some(prompt) = value.get("prompt").and_then(|v| v.as_str()) {
            self.prompt = prompt.to_string();
        }
        if let Some(worlds) = value.get("worlds").and_then(|v| v.as_array()) {
            for world_value in worlds {
                self.apply_world_snapshot(world_value);
            }
            self.worlds.sort_by_key(|w| w.id);
        }
        self.apply_barrier(value.get("barrier").unwrap_or(&serde_json::Value::Null));
        self.refresh_completion();
    }

    fn apply_world_snapshot(&mut self, world_value: &serde_json::Value) {
        let Some(world_number) = world_value.get("worldNumber").and_then(|v| v.as_u64()) else { return };
        let world_number = world_number as u8;
        if self.worlds.iter().all(|w| w.id != world_number) {
            self.worlds.push(WorldState::new(world_number, "World", ""));
        }
        let Some(world) = self.world_mut(world_number) else { return };
        let name = world_value.get("name").and_then(|v| v.as_str()).unwrap_or("World");
        world.title = format!("World {world_number}: {name}");
        world.strategy = world_value.get("strategy").and_then(|v| v.as_str()).unwrap_or("").to_string();
        world.hypothesis = world_value.get("hypothesis").and_then(|v| v.as_str()).unwrap_or("").to_string();
        world.model_tier = world_value.get("modelTier").and_then(|v| v.as_str()).unwrap_or("Standard").to_string();
        world.status = world_value.get("status").and_then(|v| v.as_str()).unwrap_or("queued").to_uppercase();
        world.progress = world_value.get("progress").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
        world.evidence_score = world_value.get("evidenceScore").and_then(|v| v.as_f64()).unwrap_or(0.0);
        world.verdict = world_value.get("verdict").and_then(|v| v.as_str()).unwrap_or("PENDING").to_string();
    }

    fn refresh_completion(&mut self) {
        self.completed = !self.worlds.is_empty() && self.worlds.iter().all(|w| {
            matches!(w.status.as_str(), "COMPLETED" | "ERROR" | "TERMINATED" | "APOPTOSIS" | "QUARANTINED" | "BLOCKED" | "IDLE")
        });
        if self.completed {
            self.show_dashboard = true;
        }
    }

    fn apply_log(&mut self, value: &serde_json::Value) {
        if !self.gate_live_message(value) {
            return;
        }
        let Some(world_number) = value.get("worldNumber").and_then(|v| v.as_u64()) else { return };
        let Some(line) = value.get("line").and_then(|v| v.as_str()) else { return };
        if let Some(world) = self.world_mut(world_number as u8) {
            world.logs.push(line.to_string());
            if world.logs.len() > MAX_LIVE_LOG_LINES {
                let overflow = world.logs.len() - MAX_LIVE_LOG_LINES;
                world.logs.drain(0..overflow);
            }
        }
    }

    fn apply_barrier(&mut self, value: &serde_json::Value) {
        if !self.gate_live_message(value) {
            return;
        }
        if let Some(status) = value.get("status").and_then(|v| v.as_str()) {
            self.barrier_status = status.to_uppercase();
        }
        if let Some(detail) = value.get("detail").and_then(|v| v.as_str()) {
            self.barrier_detail = detail.to_string();
        }
    }

    pub fn tick(&mut self) {
        if self.completed {
            return;
        }
        self.step += 1;
        for world in &mut self.worlds {
            simulation::advance_world(world, self.step);
        }

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
        if self.live {
            return; // Restarting the demo narrative is meaningless while streaming live data.
        }
        let mission_id = self.mission_id.clone();
        let prompt = self.prompt.clone();
        *self = Self::new(&mission_id, &prompt);
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

    #[test]
    fn test_live_snapshot_and_log_and_barrier() {
        let mut app = TrinityApp::new_live("trinity_123");
        assert!(app.live);
        assert!(!app.connected);

        let snapshot = serde_json::json!({
            "type": "snapshot",
            "missionId": "trinity_123",
            "prompt": "Implement a parser",
            "worlds": [
                { "worldNumber": 1, "name": "Naive", "strategy": "basic_implementation", "hypothesis": "raw need", "modelTier": "Standard", "status": "running", "progress": 40, "evidenceScore": 0.0, "verdict": "PENDING" },
                { "worldNumber": 2, "name": "Planned", "strategy": "planned_implementation", "hypothesis": "spec-driven", "modelTier": "Pro", "status": "completed", "progress": 100, "evidenceScore": 0.9, "verdict": "STRONG" },
                { "worldNumber": 3, "name": "Self-correcting", "strategy": "self_correcting", "hypothesis": "adversarial", "modelTier": "Pro", "status": "running", "progress": 60, "evidenceScore": 0.0, "verdict": "PENDING" }
            ],
            "barrier": { "status": "waiting", "detail": "Waiting for 2 workers" }
        });
        app.apply_live_message(&snapshot);
        assert_eq!(app.mission_id, "trinity_123");
        assert_eq!(app.worlds[1].status, "COMPLETED");
        assert_eq!(app.barrier_status, "WAITING");
        assert!(!app.completed);

        let log = serde_json::json!({ "type": "log", "missionId": "trinity_123", "worldNumber": 1, "line": "[10:00:00] running step" });
        app.apply_live_message(&log);
        assert_eq!(app.worlds[0].logs.last().unwrap(), "[10:00:00] running step");

        let barrier = serde_json::json!({ "type": "barrier", "missionId": "trinity_123", "status": "satisfied", "detail": "All workers terminal" });
        app.apply_live_message(&barrier);
        assert_eq!(app.barrier_status, "SATISFIED");
    }

    #[test]
    fn test_live_stale_and_foreign_messages_ignored() {
        let mut app = TrinityApp::new_live("latest");
        let first = serde_json::json!({
            "type": "snapshot", "missionId": "m1", "seq": 10, "prompt": "fresh",
            "worlds": [], "barrier": { "status": "waiting", "detail": "" }
        });
        app.apply_live_message(&first);
        assert_eq!(app.mission_id, "m1");

        let stale = serde_json::json!({
            "type": "snapshot", "missionId": "m1", "seq": 9, "prompt": "stale",
            "worlds": [], "barrier": { "status": "waiting", "detail": "" }
        });
        app.apply_live_message(&stale);
        assert_eq!(app.prompt, "fresh");

        let foreign = serde_json::json!({ "type": "barrier", "missionId": "m2", "seq": 11, "status": "satisfied", "detail": "x" });
        app.apply_live_message(&foreign);
        assert_eq!(app.barrier_status, "WAITING");
    }
}
