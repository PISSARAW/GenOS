use genos_orchestrator::{Action, Environment, Feedback, GenosEcosystem, Percept};

struct ChangingWorld {
    specification: String,
    output: Option<String>,
    writes: usize,
}

impl ChangingWorld {
    fn new() -> Self {
        Self {
            specification: "A".into(),
            output: None,
            writes: 0,
        }
    }
}

impl Environment for ChangingWorld {
    fn sense(&self, key: &str) -> Percept {
        let content = match key {
            "spec" => Some(self.specification.as_str()),
            "out" => self.output.as_deref(),
            _ => None,
        };
        Percept {
            key: key.into(),
            exists: content.is_some(),
            content: content.unwrap_or_default().into(),
            size: content.map_or(0, str::len),
        }
    }

    fn act(&mut self, action: Action) -> Feedback {
        match action {
            Action::Write { path, content } if path == "out" => {
                self.output = Some(content);
                self.writes += 1;
                if self.writes == 1 {
                    self.specification = "B".into();
                }
                Feedback {
                    success: true,
                    message: "written".into(),
                    percept: None,
                }
            }
            _ => Feedback {
                success: false,
                message: "unsupported".into(),
                percept: None,
            },
        }
    }
}

#[test]
fn agent_reobserves_a_world_changed_during_its_task() {
    let mut world = ChangingWorld::new();
    let mut agent = GenosEcosystem::new("perception-test-agent");

    let report = agent.embodied_task(&mut world, "spec", "out", 3);

    assert!(report.success, "{}", report.reason);
    assert_eq!(report.iterations, 3);
    assert_eq!(
        report.actions,
        vec![
            Action::Write {
                path: "out".into(),
                content: "A".into(),
            },
            Action::Write {
                path: "out".into(),
                content: "B".into(),
            },
        ]
    );
    assert_eq!(world.sense("out").content, "B");
}
